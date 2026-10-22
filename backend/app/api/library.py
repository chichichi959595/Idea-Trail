"""The two libraries that outlive a session: pain points and ideas.

A session's idea wall shows what this team made today. The libraries show
everything any session has made, so a problem found last week, or an idea that
went nowhere then, is still there to pick up.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from app.agents.linker import (
    IDEA_SUBJECT,
    PAIN_POINT_SUBJECT,
    LinkSubject,
    build_link_prompt,
    idea_lines,
    interpret_links,
    pain_point_lines,
)
from app.api.serializers import idea_to_dict, pain_point_to_dict
from app.api.sse import EventStream, drain, event, sse_response
from app.db.llm_log import log_llm_call
from app.db.models import (
    ConvergenceProject,
    Idea,
    IdeaLink,
    IdeationSession,
    MethodRun,
    PainPoint,
    PainPointLink,
)
from app.db.session import get_db
from app.providers.base import LLMResult, ProviderError
from app.providers.quality import stream_with_quality_guard
from app.providers.registry import get_provider, resolve_model
from app.schemas.requests import AnalyzeLinksRequest, PainPointRequest, UpdateIdeaRequest

router = APIRouter(tags=["library"])


def _clean(text: str | None) -> str | None:
    return (text or "").strip() or None


# ---- pain points -----------------------------------------------------------


@router.get("/pain-points")
def list_pain_points(db: DbSession = Depends(get_db)):
    """Newest first, each with how many ideas have been built on it."""
    counts = dict(
        db.query(Idea.pain_point_id, func.count(Idea.id))
        .filter(Idea.pain_point_id.isnot(None))
        .group_by(Idea.pain_point_id)
        .all()
    )
    rows = db.query(PainPoint).order_by(PainPoint.created_at.desc(), PainPoint.id.desc()).all()
    return [pain_point_to_dict(p, idea_count=counts.get(p.id, 0)) for p in rows]


@router.post("/pain-points")
def create_pain_point(payload: PainPointRequest, db: DbSession = Depends(get_db)):
    statement = _clean(payload.statement)
    if statement is None:
        raise HTTPException(400, "statement is required")
    if payload.session_id is not None and db.get(IdeationSession, payload.session_id) is None:
        raise HTTPException(404, "session not found")
    pain_point = PainPoint(
        session_id=payload.session_id,
        statement=statement,
        who=_clean(payload.who),
        context=_clean(payload.context),
        current_workaround=_clean(payload.current_workaround),
        source="manual",
    )
    db.add(pain_point)
    db.commit()
    return pain_point_to_dict(pain_point, idea_count=0)


@router.put("/pain-points/{pain_point_id}")
def update_pain_point(
    pain_point_id: int, payload: PainPointRequest, db: DbSession = Depends(get_db)
):
    pain_point = db.get(PainPoint, pain_point_id)
    if pain_point is None:
        raise HTTPException(404, "pain point not found")
    statement = _clean(payload.statement)
    if statement is None:
        raise HTTPException(400, "statement is required")
    pain_point.statement = statement
    pain_point.who = _clean(payload.who)
    pain_point.context = _clean(payload.context)
    pain_point.current_workaround = _clean(payload.current_workaround)
    db.commit()
    count = db.query(Idea).filter(Idea.pain_point_id == pain_point.id).count()
    return pain_point_to_dict(pain_point, idea_count=count)


@router.delete("/pain-points/{pain_point_id}")
def delete_pain_point(pain_point_id: int, db: DbSession = Depends(get_db)):
    """Remove it from the library. The runs and ideas built on it stay — they
    just stop pointing at a problem that no longer exists."""
    pain_point = db.get(PainPoint, pain_point_id)
    if pain_point is None:
        raise HTTPException(404, "pain point not found")
    db.query(MethodRun).filter(MethodRun.pain_point_id == pain_point_id).update(
        {MethodRun.pain_point_id: None}
    )
    db.query(Idea).filter(Idea.pain_point_id == pain_point_id).update({Idea.pain_point_id: None})
    db.query(PainPointLink).filter(
        (PainPointLink.pain_point_a_id == pain_point_id)
        | (PainPointLink.pain_point_b_id == pain_point_id)
    ).delete(synchronize_session=False)
    db.delete(pain_point)
    db.commit()
    return {"deleted": True}


# ---- ideas -----------------------------------------------------------------


@router.get("/ideas")
def list_all_ideas(db: DbSession = Depends(get_db)):
    """Every idea from every session — the idea library's nodes."""
    ideas = db.query(Idea).order_by(Idea.created_at, Idea.id).all()
    return [idea_to_dict(i) for i in ideas]


@router.patch("/ideas/{idea_id}")
def update_idea(idea_id: int, payload: UpdateIdeaRequest, db: DbSession = Depends(get_db)):
    idea = db.get(Idea, idea_id)
    if idea is None:
        raise HTTPException(404, "idea not found")
    idea.size = payload.size
    db.commit()
    return idea_to_dict(idea)


@router.delete("/ideas/{idea_id}")
def delete_idea(idea_id: int, db: DbSession = Depends(get_db)):
    """Remove an idea from the library, with everything that only describes it:
    its AI links and its 專案收斂 record.

    An idea merged from it keeps its `parent_idea_ids` as written — that is
    the record of what it was made from, and the screens already skip a
    parent that no longer exists.
    """
    idea = db.get(Idea, idea_id)
    if idea is None:
        raise HTTPException(404, "idea not found")
    db.query(IdeaLink).filter(
        (IdeaLink.idea_a_id == idea_id) | (IdeaLink.idea_b_id == idea_id)
    ).delete(synchronize_session=False)
    db.query(ConvergenceProject).filter(ConvergenceProject.idea_id == idea_id).delete()
    db.delete(idea)
    db.commit()
    return {"ok": True}


# ---- AI-judged links ------------------------------------------------------
#
# Both graphs get them, through the same three steps: load the library, ask
# the linker, replace the stored set. Only the model classes and the wording
# differ, so each library is one `_LinkKind`.


@dataclass(frozen=True)
class _LinkKind:
    item: type
    link: type
    a_col: str
    b_col: str
    subject: LinkSubject
    lines: Callable[[list], list[str]]
    too_few: str


IDEA_LINKS = _LinkKind(
    Idea, IdeaLink, "idea_a_id", "idea_b_id", IDEA_SUBJECT, idea_lines,
    "想法庫裡至少要有兩個想法才能分析關聯",
)
PAIN_POINT_LINKS = _LinkKind(
    PainPoint, PainPointLink, "pain_point_a_id", "pain_point_b_id", PAIN_POINT_SUBJECT,
    pain_point_lines, "痛點庫裡至少要有兩個痛點才能分析關聯",
)


def _link_dict(kind: _LinkKind, link) -> dict:
    return {
        "a": getattr(link, kind.a_col),
        "b": getattr(link, kind.b_col),
        "reason": link.reason,
        "created_at": link.created_at.isoformat(),
    }


def _load_for_links(db: DbSession, kind: _LinkKind, payload: AnalyzeLinksRequest):
    items = db.query(kind.item).order_by(kind.item.id).all()
    if len(items) < 2:
        raise HTTPException(400, kind.too_few)
    try:
        return items, resolve_model(payload.provider, payload.model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


async def _analyze_events(
    db: DbSession, kind: _LinkKind, payload: AnalyzeLinksRequest
) -> EventStream:
    """Ask the model which items are related, and replace the stored set.

    Replaced wholesale rather than merged: the model judges the library as it
    stands, so a pair it no longer links has stopped being a link. A failed
    analysis leaves the previous set alone.
    """
    items, resolved_model = _load_for_links(db, kind, payload)
    system_prompt, user_prompt, schema = build_link_prompt(kind.subject, kind.lines(items))

    try:
        provider = get_provider(payload.provider)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    result: LLMResult | None = None
    try:
        async for item in stream_with_quality_guard(
            provider,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=schema,
            model=resolved_model,
        ):
            if item.kind == "result":
                result = item.result
            else:
                yield event(item.kind, text=item.text)
    except (ProviderError, ValueError) as exc:
        raise HTTPException(502, str(exc)) from exc

    assert result is not None
    log_llm_call(db, result, system_prompt=system_prompt, user_prompt=user_prompt)

    pairs = interpret_links(result.structured, {i.id for i in items})
    if not pairs:
        db.commit()  # keep the audit row of the attempt
        raise HTTPException(502, "AI 沒有找出任何關聯，請再試一次")

    db.query(kind.link).delete()
    links = [
        kind.link(**{kind.a_col: a, kind.b_col: b}, reason=reason)
        for (a, b), reason in pairs.items()
    ]
    db.add_all(links)
    db.commit()
    yield event("result", payload=[_link_dict(kind, link) for link in links])


def _link_routes(prefix: str, kind: _LinkKind) -> None:
    @router.get(f"/{prefix}")
    def list_links(db: DbSession = Depends(get_db)):
        return [_link_dict(kind, link) for link in db.query(kind.link).all()]

    @router.post(f"/{prefix}/analyze")
    async def analyze(payload: AnalyzeLinksRequest, db: DbSession = Depends(get_db)):
        return await drain(_analyze_events(db, kind, payload))

    @router.post(f"/{prefix}/analyze/stream")
    async def analyze_stream(payload: AnalyzeLinksRequest, db: DbSession = Depends(get_db)):
        _load_for_links(db, kind, payload)
        return sse_response(lambda: _analyze_events(db, kind, payload))


_link_routes("idea-links", IDEA_LINKS)
_link_routes("pain-point-links", PAIN_POINT_LINKS)
