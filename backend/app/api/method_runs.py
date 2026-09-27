from __future__ import annotations

import datetime as dt
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.agents.framework import get_framework_agent
from app.agents.framework.base import FORCE_ACCEPT_INSTRUCTION
from app.api.serializers import idea_to_dict, method_run_to_dict
from app.api.sse import EventStream, drain, event, sse_response
from app.db.llm_log import log_llm_call
from app.db.models import Idea, IdeationSession, MethodRun, MethodStep
from app.db.session import get_db
from app.providers.base import LLMResult, ProviderError
from app.providers.quality import stream_with_quality_guard
from app.providers.registry import get_provider, resolve_model, resolve_step_model
from app.schemas.requests import AnswerStepRequest, CreateMethodRunRequest

router = APIRouter(tags=["method-runs"])


@router.post("/sessions/{session_id}/method-runs")
def create_method_run(
    session_id: int, payload: CreateMethodRunRequest, db: DbSession = Depends(get_db)
):
    session = db.get(IdeationSession, session_id)
    if session is None:
        raise HTTPException(404, "session not found")

    try:
        agent = get_framework_agent(payload.method_name)
        # Validates the provider too, and pins both of this run's models up
        # front so every later call is reproducible from the run record.
        model = resolve_model(payload.provider, payload.model)
        step_model = resolve_step_model(payload.provider, payload.step_model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    run = MethodRun(
        session_id=session_id,
        method_name=payload.method_name,
        provider=payload.provider,
        model=model,
        step_model=step_model,
        status="running",
        current_step_index=0,
    )
    db.add(run)
    db.flush()

    first_step = MethodStep(
        method_run_id=run.id,
        step_index=0,
        step_name=agent.steps[0].name,
        question_shown=agent.question_for(0),
        timer_seconds=agent.steps[0].timer_seconds,
    )
    db.add(first_step)
    db.commit()
    return method_run_to_dict(run)


@router.get("/method-runs/{run_id}")
def get_method_run(run_id: int, db: DbSession = Depends(get_db)):
    run = db.get(MethodRun, run_id)
    if run is None:
        raise HTTPException(404, "method run not found")
    return method_run_to_dict(run)


async def _call(
    db: DbSession,
    run: MethodRun,
    *,
    system_prompt: str,
    user_prompt: str,
    schema: dict,
    model: str | None,
    related_step_id: int | None = None,
) -> AsyncIterator[dict | LLMResult]:
    """Make one provider call, yielding its deltas as events and the LLMResult
    last. The result is logged to `llm_calls` before it is handed back, so an
    audit row exists whether or not the caller goes on to succeed."""
    provider = get_provider(run.provider)
    result: LLMResult | None = None
    try:
        async for item in stream_with_quality_guard(
            provider,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=schema,
            model=model,
        ):
            if item.kind == "result":
                result = item.result
            else:
                yield event(item.kind, text=item.text)
    except (ProviderError, ValueError) as exc:
        raise HTTPException(502, str(exc)) from exc

    assert result is not None  # stream_with_quality_guard always ends with one
    log_llm_call(
        db,
        result,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        session_id=run.session_id,
        related_step_id=related_step_id,
    )
    yield result


def _load_run_for_answer(db: DbSession, run_id: int, payload: AnswerStepRequest) -> MethodRun:
    run = db.get(MethodRun, run_id)
    if run is None:
        raise HTTPException(404, "method run not found")
    if run.status != "running":
        raise HTTPException(400, f"method run is already {run.status}")
    if payload.step_index != run.current_step_index:
        # Stale/duplicate submission (e.g. a client retry after a slow CLI call
        # already advanced the run) — reject instead of silently answering the
        # wrong step.
        raise HTTPException(
            409,
            f"run is currently on step {run.current_step_index}, "
            f"not {payload.step_index}; refetch the method run before retrying",
        )
    return run


@router.post("/method-runs/{run_id}/answer")
async def answer_step(run_id: int, payload: AnswerStepRequest, db: DbSession = Depends(get_db)):
    """Answer the current step and return the outcome once it's settled."""
    return await drain(_answer_step_events(db, run_id, payload))


@router.post("/method-runs/{run_id}/answer/stream")
async def answer_step_stream(
    run_id: int, payload: AnswerStepRequest, db: DbSession = Depends(get_db)
):
    """Identical work to `POST .../answer`, with the model's reasoning streamed
    while it happens. The final `result` event carries the same body."""
    # Validated before the response starts so a stale step_index is still a
    # 409 rather than an `error` event inside a 200.
    _load_run_for_answer(db, run_id, payload)
    return sse_response(lambda: _answer_step_events(db, run_id, payload))


async def _answer_step_events(
    db: DbSession, run_id: int, payload: AnswerStepRequest
) -> EventStream:
    run = _load_run_for_answer(db, run_id, payload)
    session = db.get(IdeationSession, run.session_id)
    agent = get_framework_agent(run.method_name)

    current_step = next(
        (s for s in run.steps if s.step_index == run.current_step_index), None
    )
    if current_step is None:
        raise HTTPException(500, "current step record is missing")

    answer_text = payload.answer.strip()
    if answer_text:
        prior_steps = [s for s in run.steps if s.step_index < run.current_step_index]
        system_prompt, user_prompt, schema = agent.build_step_prompt(
            run.current_step_index, session, prior_steps, payload.answer
        )
        if payload.force:
            # 強制送出: the user saw the AI's complaint and chose to keep this
            # answer anyway, so drop the relevance gate for this call.
            system_prompt = f"{system_prompt}\n\n{FORCE_ACCEPT_INSTRUCTION}"

        result = None
        async for item in _call(
            db,
            run,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema=schema,
            # Step agents run on the run's step model; only convergence gets
            # the deep one.
            model=run.step_model or run.model,
            related_step_id=current_step.id,
        ):
            if isinstance(item, LLMResult):
                result = item
            else:
                yield item

        structured = result.structured or {}
        if not payload.force and not structured.get("is_relevant", True):
            # Off-topic/empty answer — leave the step untouched so the same
            # step_index can be retried, and tell the user why.
            db.commit()
            yield event(
                "result",
                payload={
                    "accepted": False,
                    "feedback": structured.get("clarification")
                    or "這個回答看起來文不對題，可以再具體說明一下嗎？",
                    "method_run": method_run_to_dict(run),
                    "ideas": None,
                },
            )
            return

        current_step.user_answer = payload.answer
        current_step.agent_output_json = structured
    else:
        # Timer ran out with nothing typed — skip straight to the next step
        # instead of running (and likely failing) the relevance check on
        # an answer that doesn't exist.
        current_step.user_answer = None
        current_step.agent_output_json = None

    next_index = run.current_step_index + 1
    if next_index < len(agent.steps):
        run.current_step_index = next_index
        db.add(
            MethodStep(
                method_run_id=run.id,
                step_index=next_index,
                step_name=agent.steps[next_index].name,
                question_shown=agent.question_for(next_index),
                timer_seconds=agent.steps[next_index].timer_seconds,
            )
        )
        db.commit()
        yield event(
            "result",
            payload={
                "accepted": True,
                "feedback": None,
                "method_run": method_run_to_dict(run),
                "ideas": None,
            },
        )
        return

    # last step answered — run the finalize/convergence call
    db.flush()
    new_ideas = []
    async for item in _finalize_events(db, run, session):
        if item["kind"] == "ideas":
            new_ideas = item["ideas"]
        else:
            yield item
    yield event(
        "result",
        payload={
            "accepted": True,
            "feedback": None,
            "method_run": method_run_to_dict(run),
            "ideas": [idea_to_dict(i) for i in new_ideas],
        },
    )


def _load_run_for_finalize(db: DbSession, run_id: int) -> tuple[MethodRun, IdeationSession]:
    run = db.get(MethodRun, run_id)
    if run is None:
        raise HTTPException(404, "method run not found")
    if run.status != "failed":
        raise HTTPException(400, f"method run is {run.status}; only a failed run can be finalized again")
    session = db.get(IdeationSession, run.session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    return run, session


@router.post("/method-runs/{run_id}/finalize")
async def retry_finalize(run_id: int, db: DbSession = Depends(get_db)):
    """Re-run the convergence step for a run whose finalize produced nothing.

    Every answer is already stored, so this replays only the last call — the
    user doesn't have to walk the whole method again (which, for Crazy 8s,
    means eight more timed rounds).
    """
    return await drain(_retry_finalize_events(db, run_id))


@router.post("/method-runs/{run_id}/finalize/stream")
async def retry_finalize_stream(run_id: int, db: DbSession = Depends(get_db)):
    _load_run_for_finalize(db, run_id)
    return sse_response(lambda: _retry_finalize_events(db, run_id))


async def _retry_finalize_events(db: DbSession, run_id: int) -> EventStream:
    run, session = _load_run_for_finalize(db, run_id)
    run.status = "running"  # _finalize_events decides the outcome from here
    new_ideas = []
    async for item in _finalize_events(db, run, session):
        if item["kind"] == "ideas":
            new_ideas = item["ideas"]
        else:
            yield item
    yield event(
        "result",
        payload={
            "accepted": True,
            "feedback": None,
            "method_run": method_run_to_dict(run),
            "ideas": [idea_to_dict(i) for i in new_ideas],
        },
    )


async def _finalize_events(
    db: DbSession, run: MethodRun, session: IdeationSession
) -> EventStream:
    """Converge a finished run's answers into concrete ideas.

    A call that comes back without any ideas leaves the run `failed`, not
    `done`. The schema asks for at least two, but that is not a guarantee from
    every route — the Anthropic API's structured outputs reject array-length
    constraints, so `minItems` is stripped before the request and the floor is
    carried by the prompt text instead — and a provider can also hand back
    something unparseable (codex turns invalid JSON into `None` rather than
    raising). Marking any of that `done` used to strand the user: the UI
    reported success, the idea board was empty, and the run could never be
    retried.
    """
    agent = get_framework_agent(run.method_name)
    all_steps = sorted(run.steps, key=lambda s: s.step_index)
    system_prompt, user_prompt, schema = agent.build_finalize_prompt(session, all_steps)

    result = None
    async for item in _call(
        db,
        run,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema=schema,
        model=run.model,
    ):
        if isinstance(item, LLMResult):
            result = item
        else:
            yield item

    new_ideas = []
    for item in (result.structured or {}).get("ideas", []):
        if not item.get("title") or not item.get("description"):
            continue
        idea = Idea(
            session_id=run.session_id,
            method_run_id=run.id,
            title=item["title"],
            description=item["description"],
            source_method=run.method_name,
            is_synthesized=False,
        )
        db.add(idea)
        new_ideas.append(idea)

    if new_ideas:
        run.status = "done"
        run.finished_at = dt.datetime.now(dt.timezone.utc)
    else:
        # Retryable, so no finished_at — this run hasn't reached an end state.
        run.status = "failed"
        run.finished_at = None
    db.commit()
    # Not a "result": the caller wraps these ideas in its own response body.
    yield event("ideas", ideas=new_ideas)
