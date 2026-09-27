from __future__ import annotations

from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.agents import method_selector
from app.agents.synthesizer import build_synthesis_prompt
from app.api.serializers import idea_to_dict, recommendation_to_dict, session_to_dict
from app.api.sse import EventStream, drain, event, sse_response
from app.db.llm_log import log_llm_call
from app.db.models import Idea, IdeationSession, MethodRecommendation
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


@router.post("")
def create_session(payload: CreateSessionRequest, db: DbSession = Depends(get_db)):
    session = IdeationSession(**payload.model_dump())
    db.add(session)
    db.commit()
    return session_to_dict(session)


@router.get("/{session_id}")
def get_session(session_id: int, db: DbSession = Depends(get_db)):
    session = db.get(IdeationSession, session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    return session_to_dict(session)


def _load_session_for_recommend(db: DbSession, session_id: int, provider: str, model: str | None):
    session = db.get(IdeationSession, session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    try:
        return session, resolve_model(provider, model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/{session_id}/method-recommendation")
async def recommend_methods(
    session_id: int,
    provider: str = "claude",
    model: str | None = None,
    db: DbSession = Depends(get_db),
):
    return await drain(_recommend_events(db, session_id, provider, model))


@router.post("/{session_id}/method-recommendation/stream")
async def recommend_methods_stream(
    session_id: int,
    provider: str = "claude",
    model: str | None = None,
    db: DbSession = Depends(get_db),
):
    """Same work as the plain POST, reasoning streamed. This is the first call
    of a session, so it's the first wait the user ever sits through."""
    _load_session_for_recommend(db, session_id, provider, model)
    return sse_response(lambda: _recommend_events(db, session_id, provider, model))


async def _recommend_events(
    db: DbSession, session_id: int, provider: str, model: str | None
) -> EventStream:
    session, resolved_model = _load_session_for_recommend(db, session_id, provider, model)

    prompt = method_selector.build_prompt(session)
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

    db.query(MethodRecommendation).filter(MethodRecommendation.session_id == session_id).delete()
    records = []
    for rank, method in enumerate(rec_result.methods, start=1):
        rec = MethodRecommendation(
            session_id=session_id,
            method=method,
            rank=rank,
            rationale=rec_result.rationale_by_method.get(method, ""),
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

    ideas = (
        db.query(Idea)
        .filter(Idea.session_id == session_id, Idea.id.in_(payload.idea_ids))
        .all()
    )
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
