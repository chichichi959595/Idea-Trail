from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.agents.framework import get_framework_agent
from app.agents.framework.base import FORCE_ACCEPT_INSTRUCTION
from app.api.serializers import idea_to_dict, method_run_to_dict
from app.db.llm_log import log_llm_call
from app.db.models import Idea, IdeationSession, MethodRun, MethodStep
from app.db.session import get_db
from app.providers.base import ProviderError
from app.providers.quality import complete_with_quality_guard
from app.providers.registry import get_provider, resolve_model
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
        # Validates the provider too, and pins whichever model this run will
        # use for every one of its steps.
        model = resolve_model(payload.provider, payload.model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    run = MethodRun(
        session_id=session_id,
        method_name=payload.method_name,
        provider=payload.provider,
        model=model,
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


@router.post("/method-runs/{run_id}/answer")
async def answer_step(run_id: int, payload: AnswerStepRequest, db: DbSession = Depends(get_db)):
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

    session = db.get(IdeationSession, run.session_id)
    agent = get_framework_agent(run.method_name)
    provider = get_provider(run.provider)

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

        try:
            result = await complete_with_quality_guard(
                provider,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                json_schema=schema,
                model=run.model,
            )
        except (ProviderError, ValueError) as exc:
            raise HTTPException(502, str(exc)) from exc

        log_llm_call(
            db,
            result,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            session_id=run.session_id,
            related_step_id=current_step.id,
        )

        structured = result.structured or {}
        if not payload.force and not structured.get("is_relevant", True):
            # Off-topic/empty answer — leave the step untouched so the same
            # step_index can be retried, and tell the user why.
            db.commit()
            return {
                "accepted": False,
                "feedback": structured.get("clarification") or "這個回答看起來文不對題，可以再具體說明一下嗎？",
                "method_run": method_run_to_dict(run),
                "ideas": None,
            }

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
        return {"accepted": True, "feedback": None, "method_run": method_run_to_dict(run), "ideas": None}

    # last step answered — run the finalize/convergence call
    db.flush()
    new_ideas = await _finalize(db, run, session)
    return {
        "accepted": True,
        "feedback": None,
        "method_run": method_run_to_dict(run),
        "ideas": [idea_to_dict(i) for i in new_ideas],
    }


@router.post("/method-runs/{run_id}/finalize")
async def retry_finalize(run_id: int, db: DbSession = Depends(get_db)):
    """Re-run the convergence step for a run whose finalize produced nothing.

    Every answer is already stored, so this replays only the last call — the
    user doesn't have to walk the whole method again (which, for Crazy 8s,
    means eight more timed rounds).
    """
    run = db.get(MethodRun, run_id)
    if run is None:
        raise HTTPException(404, "method run not found")
    if run.status != "failed":
        raise HTTPException(400, f"method run is {run.status}; only a failed run can be finalized again")

    session = db.get(IdeationSession, run.session_id)
    if session is None:
        raise HTTPException(404, "session not found")

    run.status = "running"  # _finalize decides the outcome from here
    new_ideas = await _finalize(db, run, session)
    return {
        "accepted": True,
        "feedback": None,
        "method_run": method_run_to_dict(run),
        "ideas": [idea_to_dict(i) for i in new_ideas],
    }


async def _finalize(db: DbSession, run: MethodRun, session: IdeationSession) -> list[Idea]:
    """Converge a finished run's answers into concrete ideas.

    A call that comes back without any ideas leaves the run `failed`, not
    `done`. The schema now forbids an empty list, but a provider can still
    hand back something unparseable (codex turns invalid JSON into `None`
    rather than raising), and marking that `done` used to strand the user:
    the UI reported success, the idea board was empty, and the run could
    never be retried.
    """
    agent = get_framework_agent(run.method_name)
    provider = get_provider(run.provider)
    all_steps = sorted(run.steps, key=lambda s: s.step_index)
    system_prompt, user_prompt, schema = agent.build_finalize_prompt(session, all_steps)

    try:
        result = await complete_with_quality_guard(
            provider,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=schema,
            model=run.model,
        )
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc

    log_llm_call(
        db, result, system_prompt=system_prompt, user_prompt=user_prompt, session_id=run.session_id
    )

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
    return new_ideas
