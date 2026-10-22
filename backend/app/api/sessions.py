from __future__ import annotations

from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.agents import method_selector
from app.agents.synthesizer import build_synthesis_prompt
from app.api.serializers import idea_to_dict, recommendation_to_dict, session_to_dict
from app.api.sse import EventStream, drain, event, sse_response
from app.db.llm_log import log_llm_call
from app.db.models import Idea, IdeationSession, MethodRecommendation, MethodRun, PainPoint
from app.db.session import get_db
from app.providers.base import LLMResult, ProviderError
from app.providers.quality import stream_with_quality_guard
from app.providers.registry import get_provider, resolve_model
from app.schemas.requests import CreateSessionRequest, SynthesizeRequest

router = APIRouter(prefix="/sessions", tags=["sessions"])


async def _call(
    db: DbSession,
    *,
    provider_name: str,
    system_prompt: str,
    user_prompt: str,
    schema: dict,
    model: str | None,
    session_id: int,
) -> AsyncIterator[dict | LLMResult]:
    """One provider call: deltas out as events, the LLMResult last, logged on
    the way past. Same shape as the helper in method_runs."""
    try:
        provider = get_provider(provider_name)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

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

    assert result is not None
    log_llm_call(
        db, result, system_prompt=system_prompt, user_prompt=user_prompt, session_id=session_id
    )
    yield result


def _pain_point_in_use(db: DbSession, pain_point: PainPoint) -> bool:
    return (
        db.query(MethodRun).filter(MethodRun.pain_point_id == pain_point.id).first() is not None
        or db.query(Idea).filter(Idea.pain_point_id == pain_point.id).first() is not None
    )


def _sync_setup_pain_point(db: DbSession, session: IdeationSession) -> PainPoint | None:
    """Keep the problem written on the setup screen in the pain point library.

    The setup screen asks "do you already have a problem?" — a yes is the team
    skipping 痛點發想, so what they wrote has to land in the library like any
    other pain point, or 專案發想 would have nothing to work on.

    The row follows the form while nothing has used it yet. Once a run has, it
    is part of that run's history and stays put: an edit becomes a new row,
    and clearing the answer leaves it in the library.
    """
    text = (session.clear_problem_text or "").strip() if session.has_clear_problem else ""
    current = (
        db.query(PainPoint)
        .filter(PainPoint.session_id == session.id, PainPoint.source == "setup")
        .order_by(PainPoint.id.desc())
        .first()
    )
    in_use = current is not None and _pain_point_in_use(db, current)

    if not text:
        if current is not None and not in_use:
            db.delete(current)
        return None
    if current is not None and current.statement == text:
        return current
    if current is not None and not in_use:
        current.statement = text
        return current
    created = PainPoint(session_id=session.id, statement=text, source="setup")
    db.add(created)
    return created


def _session_response(db: DbSession, session: IdeationSession) -> dict:
    setup_pain_point = _sync_setup_pain_point(db, session)
    db.commit()
    return {
        **session_to_dict(session),
        "setup_pain_point_id": setup_pain_point.id if setup_pain_point else None,
    }


@router.post("")
def create_session(payload: CreateSessionRequest, db: DbSession = Depends(get_db)):
    session = IdeationSession(**payload.model_dump())
    db.add(session)
    db.flush()
    return _session_response(db, session)


@router.put("/{session_id}")
def replace_session_intake(
    session_id: int, payload: CreateSessionRequest, db: DbSession = Depends(get_db)
):
    """Overwrite a session's intake answers.

    The team's answers used to be collected once, on a screen the user could
    never get back to. They now live on the setup screen alongside the provider
    and the method, so they can be corrected after the fact — and every later
    call (the recommendation, each step, the convergence) reads them from this
    row, which means the row has to be able to follow the form.

    A full replace rather than a patch: the form always holds the whole intake,
    and clearing a field has to be able to clear it here too.
    """
    session = db.get(IdeationSession, session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    for field, value in payload.model_dump().items():
        setattr(session, field, value)
    return _session_response(db, session)


@router.get("/{session_id}")
def get_session(session_id: int, db: DbSession = Depends(get_db)):
    session = db.get(IdeationSession, session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    return session_to_dict(session)


def _load_session_for_recommend(
    db: DbSession,
    session_id: int,
    provider: str,
    model: str | None,
    pain_point_id: int | None,
    stage: str = "ideation",
):
    if stage not in method_selector.STAGES:
        raise HTTPException(400, f"unknown stage '{stage}'")
    session = db.get(IdeationSession, session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    pain_point = None
    if pain_point_id is not None:
        pain_point = db.get(PainPoint, pain_point_id)
        if pain_point is None:
            raise HTTPException(404, "pain point not found")
    try:
        return session, pain_point, resolve_model(provider, model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/{session_id}/method-recommendation")
async def recommend_methods(
    session_id: int,
    provider: str = "claude",
    model: str | None = None,
    pain_point_id: int | None = None,
    stage: str = "ideation",
    db: DbSession = Depends(get_db),
):
    """`stage` picks the catalog: 專案發想's methods ("ideation") or
    痛點發想's ("discovery"). A pain point only means something to the first."""
    return await drain(
        _recommend_events(db, session_id, provider, model, pain_point_id, stage)
    )


@router.post("/{session_id}/method-recommendation/stream")
async def recommend_methods_stream(
    session_id: int,
    provider: str = "claude",
    model: str | None = None,
    pain_point_id: int | None = None,
    stage: str = "ideation",
    db: DbSession = Depends(get_db),
):
    """Same work as the plain POST, reasoning streamed."""
    _load_session_for_recommend(db, session_id, provider, model, pain_point_id, stage)
    return sse_response(
        lambda: _recommend_events(db, session_id, provider, model, pain_point_id, stage)
    )


async def _recommend_events(
    db: DbSession,
    session_id: int,
    provider: str,
    model: str | None,
    pain_point_id: int | None,
    stage: str = "ideation",
) -> EventStream:
    session, pain_point, resolved_model = _load_session_for_recommend(
        db, session_id, provider, model, pain_point_id, stage
    )

    discovery = stage == "discovery"
    prompt = (
        method_selector.build_discovery_prompt(session)
        if discovery
        else method_selector.build_prompt(session, pain_point)
    )
    result = None
    async for item in _call(
        db,
        provider_name=provider,
        system_prompt=prompt.system_prompt,
        user_prompt=prompt.user_prompt,
        schema=prompt.schema,
        model=resolved_model,
        session_id=session_id,
    ):
        if isinstance(item, LLMResult):
            result = item
        else:
            yield item
    rec_result = method_selector.interpret(prompt, result)

    # Each stage replaces only its own list: recommending 痛點發想's methods
    # must not wipe the ones 專案發想 is showing, or the other way round.
    stored_stage = "discovery" if discovery else None
    db.query(MethodRecommendation).filter(
        MethodRecommendation.session_id == session_id,
        MethodRecommendation.stage.is_(None)
        if stored_stage is None
        else MethodRecommendation.stage == stored_stage,
    ).delete()
    records = []
    for rank, method in enumerate(rec_result.methods, start=1):
        rec = MethodRecommendation(
            session_id=session_id,
            method=method,
            rank=rank,
            rationale=rec_result.rationale_by_method.get(method, ""),
            stage=stored_stage,
        )
        db.add(rec)
        records.append(rec)

    db.commit()
    yield event(
        "result",
        payload={
            "recommendations": [recommendation_to_dict(r) for r in records],
            "rule_ranking": rec_result.rule_ranking,
            "adjustment_note": rec_result.adjustment_note,
        },
    )


@router.get("/{session_id}/ideas")
def list_ideas(session_id: int, db: DbSession = Depends(get_db)):
    ideas = db.query(Idea).filter(Idea.session_id == session_id).order_by(Idea.created_at).all()
    return [idea_to_dict(i) for i in ideas]


def _load_for_synthesis(db: DbSession, session_id: int, payload: SynthesizeRequest):
    session = db.get(IdeationSession, session_id)
    if session is None:
        raise HTTPException(404, "session not found")

    # Any idea in the library, not only this session's: the merge is chosen
    # in 想法庫, which spans sessions. The session in the path is whose team
    # context the merge is argued for, and where the merged idea is filed.
    ideas = db.query(Idea).filter(Idea.id.in_(payload.idea_ids)).all()
    if not ideas:
        raise HTTPException(400, "no matching ideas for the given idea_ids")

    try:
        return session, ideas, resolve_model(payload.provider, payload.model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/{session_id}/synthesize")
async def synthesize(session_id: int, payload: SynthesizeRequest, db: DbSession = Depends(get_db)):
    return await drain(_synthesize_events(db, session_id, payload))


@router.post("/{session_id}/synthesize/stream")
async def synthesize_stream(
    session_id: int, payload: SynthesizeRequest, db: DbSession = Depends(get_db)
):
    _load_for_synthesis(db, session_id, payload)
    return sse_response(lambda: _synthesize_events(db, session_id, payload))


async def _synthesize_events(
    db: DbSession, session_id: int, payload: SynthesizeRequest
) -> EventStream:
    session, ideas, resolved_model = _load_for_synthesis(db, session_id, payload)

    system_prompt, user_prompt, schema = build_synthesis_prompt(session, ideas)
    result = None
    async for item in _call(
        db,
        provider_name=payload.provider,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema=schema,
        model=resolved_model,
        session_id=session_id,
    ):
        if isinstance(item, LLMResult):
            result = item
        else:
            yield item

    # A merge stays on its problem only if every parent was on the same one.
    parent_pain_points = {i.pain_point_id for i in ideas}
    shared_pain_point = parent_pain_points.pop() if len(parent_pain_points) == 1 else None

    new_ideas = []
    for item in (result.structured or {}).get("ideas", []):
        if not item.get("title") or not item.get("description"):
            continue
        idea = Idea(
            session_id=session_id,
            method_run_id=None,
            title=item["title"],
            description=item["description"],
            source_method=None,
            is_synthesized=True,
            parent_idea_ids=payload.idea_ids,
            pain_point_id=shared_pain_point,
        )
        db.add(idea)
        new_ideas.append(idea)

    if not new_ideas:
        # Returning an empty list here would look like a successful merge that
        # simply produced nothing, and the idea board would silently not change.
        db.commit()  # the audit record of the failed attempt is already written
        raise HTTPException(502, "AI 沒有產出任何整合想法，請再試一次")
    db.commit()
    yield event("result", payload=[idea_to_dict(i) for i in new_ideas])
