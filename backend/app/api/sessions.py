from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.agents import method_selector
from app.agents.synthesizer import build_synthesis_prompt
from app.api.serializers import idea_to_dict, recommendation_to_dict, session_to_dict
from app.db.llm_log import log_llm_call
from app.db.models import Idea, IdeationSession, MethodRecommendation
from app.db.session import get_db
from app.providers.base import ProviderError
from app.providers.quality import complete_with_quality_guard
from app.providers.registry import get_provider
from app.schemas.requests import CreateSessionRequest, SynthesizeRequest

router = APIRouter(prefix="/sessions", tags=["sessions"])


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


@router.post("/{session_id}/method-recommendation")
async def recommend_methods(session_id: int, provider: str = "claude", db: DbSession = Depends(get_db)):
    session = db.get(IdeationSession, session_id)
    if session is None:
        raise HTTPException(404, "session not found")

    try:
        rec_result = await method_selector.recommend(session, provider)
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc

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

    log_llm_call(
        db,
        rec_result.result,
        system_prompt=method_selector.SELECTOR_SYSTEM_PROMPT,
        user_prompt=rec_result.user_prompt,
        session_id=session_id,
    )
    db.commit()
    return {
        "recommendations": [recommendation_to_dict(r) for r in records],
        "rule_ranking": rec_result.rule_ranking,
        "adjustment_note": rec_result.adjustment_note,
    }


@router.get("/{session_id}/ideas")
def list_ideas(session_id: int, db: DbSession = Depends(get_db)):
    ideas = db.query(Idea).filter(Idea.session_id == session_id).order_by(Idea.created_at).all()
    return [idea_to_dict(i) for i in ideas]


@router.post("/{session_id}/synthesize")
async def synthesize(session_id: int, payload: SynthesizeRequest, db: DbSession = Depends(get_db)):
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

    system_prompt, user_prompt, schema = build_synthesis_prompt(session, ideas)
    try:
        provider = get_provider(payload.provider)
        result = await complete_with_quality_guard(
            provider, system_prompt=system_prompt, user_prompt=user_prompt, json_schema=schema
        )
    except (ProviderError, ValueError) as exc:
        raise HTTPException(502, str(exc)) from exc

    new_ideas = []
    for item in (result.structured or {}).get("ideas", []):
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

    log_llm_call(
        db, result, system_prompt=system_prompt, user_prompt=user_prompt, session_id=session_id
    )
    db.commit()
    return [idea_to_dict(i) for i in new_ideas]
