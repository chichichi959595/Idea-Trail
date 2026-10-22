"""專案收斂: one idea at a time, from 需求分析 to the go / pivot / drop call.

The record is a `ConvergenceProject`; each agent stage is one endpoint that
rewrites one of its JSON columns, and everything the user decides comes in
through the one PATCH. See `app.agents.convergence` for the stages and why
they run in this order.

No `from __future__ import annotations` here: `_agent_route` builds endpoint
functions whose payload type is a runtime variable, and FastAPI has to see
that annotation as the class itself, not as the string "payload_type".
"""

import datetime as dt
import uuid
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.agents.convergence import (
    DIALOGUE_MAX_CHARS,
    MOSCOW_LABELS,
    build_debate_prompt,
    build_feasibility_prompt,
    build_features_prompt,
    build_impact_effort_prompt,
    build_research_summary_prompt,
    build_search_query_prompt,
    build_web_research_prompt,
    clamp_score,
    render_context,
)
from app.api.cancel import request_cancel
from app.api.serializers import convergence_project_to_dict
from app.api.sse import EventStream, drain, event, sse_response
from app.db.llm_log import log_llm_call
from app.db.models import ConvergenceProject, Idea, IdeationSession, PainPoint
from app.db.session import get_db
from app.github_search import GitHubSearchError, search_repositories
from app.providers.base import ProviderError
from app.providers.quality import stream_with_quality_guard
from app.providers.registry import get_provider, resolve_model
from app.schemas.requests import (
    ConvergenceAgentRequest,
    CreateConvergenceRequest,
    DebateReplyRequest,
    DebateRoundRequest,
    UpdateConvergenceRequest,
)

router = APIRouter(tags=["convergence"])

_MAX_TITLE = 60
_MAX_DESCRIPTION = 400


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _cancel_key(project_id: int) -> str:
    return f"convergence-{project_id}"


def _load(db: DbSession, project_id: int) -> ConvergenceProject:
    project = db.get(ConvergenceProject, project_id)
    if project is None:
        raise HTTPException(404, "convergence project not found")
    return project


# ---- the user's half: plain CRUD ------------------------------------------


@router.get("/convergence-projects")
def list_projects(db: DbSession = Depends(get_db)):
    rows = db.query(ConvergenceProject).order_by(ConvergenceProject.updated_at.desc()).all()
    return [convergence_project_to_dict(p) for p in rows]


@router.post("/convergence-projects")
def open_project(payload: CreateConvergenceRequest, db: DbSession = Depends(get_db)):
    """Get-or-create: an idea has one convergence record, so sending the same
    idea here again picks up where it was left rather than starting over."""
    idea = db.get(Idea, payload.idea_id)
    if idea is None:
        raise HTTPException(404, "idea not found")
    if payload.session_id is not None and db.get(IdeationSession, payload.session_id) is None:
        raise HTTPException(404, "session not found")

    project = (
        db.query(ConvergenceProject).filter(ConvergenceProject.idea_id == idea.id).first()
    )
    if project is None:
        project = ConvergenceProject(
            idea_id=idea.id, session_id=payload.session_id or idea.session_id
        )
        db.add(project)
    elif payload.session_id is not None:
        project.session_id = payload.session_id
    db.commit()
    return convergence_project_to_dict(project)


@router.get("/convergence-projects/{project_id}")
def get_project(project_id: int, db: DbSession = Depends(get_db)):
    return convergence_project_to_dict(_load(db, project_id))


def clean_features(raw: list[dict]) -> list[dict]:
    """Validate a feature list sent whole from the screen.

    Drops entries without a title rather than rejecting the whole list: a
    drag that lands while the user is mid-way through typing a new card
    shouldn't fail to save every other card's position.
    """
    out: list[dict] = []
    seen_ids: set[str] = set()
    for f in raw:
        if not isinstance(f, dict):
            continue
        title = str(f.get("title") or "").strip()[:_MAX_TITLE]
        if not title:
            continue
        fid = str(f.get("id") or "").strip() or uuid.uuid4().hex[:8]
        if fid in seen_ids:
            fid = uuid.uuid4().hex[:8]
        seen_ids.add(fid)
        moscow = f.get("moscow")
        out.append(
            {
                "id": fid,
                "title": title,
                "description": str(f.get("description") or "").strip()[:_MAX_DESCRIPTION],
                "source": "ai" if f.get("source") == "ai" else "user",
                "moscow": moscow if moscow in MOSCOW_LABELS else None,
                "impact": clamp_score(f.get("impact")),
                "effort": clamp_score(f.get("effort")),
                "ai_impact": clamp_score(f.get("ai_impact")),
                "ai_effort": clamp_score(f.get("ai_effort")),
                "ai_rationale": (str(f.get("ai_rationale") or "").strip() or None),
            }
        )
    return out


@router.patch("/convergence-projects/{project_id}")
def update_project(
    project_id: int, payload: UpdateConvergenceRequest, db: DbSession = Depends(get_db)
):
    project = _load(db, project_id)
    sent = payload.model_fields_set
    if "demand_verdict" in sent:
        project.demand_verdict = payload.demand_verdict
    if "demand_notes" in sent:
        project.demand_notes = (payload.demand_notes or "").strip() or None
    if "features" in sent:
        project.features = clean_features(payload.features or [])
    if "debate" in sent:
        if payload.debate:
            raise HTTPException(400, "debate can only be cleared, not rewritten")
        project.debate = None
    if "decision" in sent:
        project.decision = payload.decision
    if "decision_notes" in sent:
        project.decision_notes = (payload.decision_notes or "").strip() or None
    project.updated_at = _now()
    db.commit()
    return convergence_project_to_dict(project)


@router.delete("/convergence-projects/{project_id}")
def delete_project(project_id: int, db: DbSession = Depends(get_db)):
    db.delete(_load(db, project_id))
    db.commit()
    return {"ok": True}


@router.post("/convergence-projects/{project_id}/cancel")
async def cancel_project_call(project_id: int):
    """Stop whichever agent stage this project has in flight — same reason as
    `POST /method-runs/{id}/cancel`: a CLI provider writes nothing for the
    whole call, so a closed connection alone never reaches it."""
    return {"stopped": request_cancel(_cancel_key(project_id))}


# ---- the agents' half -------------------------------------------------------


class _Ctx:
    """Everything a stage's prompt reads, loaded once per call."""

    def __init__(self, db: DbSession, project_id: int, payload: ConvergenceAgentRequest):
        self.db = db
        self.project = _load(db, project_id)
        self.idea = db.get(Idea, self.project.idea_id)
        if self.idea is None:  # pragma: no cover - deleting an idea deletes this row
            raise HTTPException(404, "idea not found")
        session_id = self.project.session_id or self.idea.session_id
        self.session = db.get(IdeationSession, session_id) if session_id else None
        self.pain_point = (
            db.get(PainPoint, self.idea.pain_point_id) if self.idea.pain_point_id else None
        )
        try:
            self.provider = get_provider(payload.provider)
            self.model = resolve_model(payload.provider, payload.model)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        self.text = render_context(self.session, self.idea, self.pain_point)

    async def ask(self, system_prompt: str, user_prompt: str, schema: dict, out: list):
        """One structured call, streamed. Appends the structured result to
        `out` — a generator can't also return a value."""
        result = None
        try:
            async for item in stream_with_quality_guard(
                self.provider,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                json_schema=schema,
                model=self.model,
            ):
                if item.kind == "result":
                    result = item.result
                else:
                    yield event(item.kind, text=item.text)
        except (ProviderError, ValueError) as exc:
            raise HTTPException(502, str(exc)) from exc
        assert result is not None
        log_llm_call(
            self.db,
            result,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            session_id=self.session.id if self.session else None,
        )
        out.append(result.structured or {})

    def done(self) -> dict:
        self.project.updated_at = _now()
        self.db.commit()
        return event("result", payload=convergence_project_to_dict(self.project))


def _agent_route(
    path: str,
    payload_type: type,
    work: Callable[[_Ctx, ConvergenceAgentRequest], EventStream],
    preflight: Callable[[_Ctx], None] = lambda ctx: None,
) -> None:
    """Register a stage as a plain POST and its `/stream` twin, sharing one
    generator — the same split every other waited-on call in the app uses."""

    def run(db: DbSession, project_id: int, payload) -> EventStream:
        ctx = _Ctx(db, project_id, payload)
        preflight(ctx)
        return work(ctx, payload)

    async def plain(project_id: int, payload: payload_type, db: DbSession = Depends(get_db)):
        return await drain(run(db, project_id, payload))

    async def stream(project_id: int, payload: payload_type, db: DbSession = Depends(get_db)):
        # Validate before the first byte, so a bad request is still a real 4xx.
        preflight(_Ctx(db, project_id, payload))
        return sse_response(
            lambda: run(db, project_id, payload), cancel_key=_cancel_key(project_id)
        )

    router.post(f"/convergence-projects/{{project_id}}/{path}")(plain)
    router.post(f"/convergence-projects/{{project_id}}/{path}/stream")(stream)


# 2. 需求分析 — one more round of 正方 then 反方, as one line each (對話)
# or a full written argument each (分析).


_SIDE_LABELS = {"pro": "正方", "con": "反方"}


async def _agent_turn(
    ctx: _Ctx,
    side: str,
    turns: list[dict],
    round_no: int,
    focus: str | None,
    mode: str,
) -> EventStream:
    """One side's agent speaks once; the turn is appended to `turns`."""
    label = _SIDE_LABELS[side]
    yield event("text", text=f"\n\n### 第 {round_no} 輪・{label}\n")
    out: list[dict] = []
    system_prompt, user_prompt, schema = build_debate_prompt(
        side, ctx.text, turns, round_no, focus, mode
    )
    async for item in ctx.ask(system_prompt, user_prompt, schema, out):
        yield item
    structured = out[0]
    argument = str(structured.get("argument") or "").strip()
    if not argument:
        raise HTTPException(502, f"{label} Agent 沒有提出論點，請再試一次")
    if mode == "dialogue" and len(argument) > DIALOGUE_MAX_CHARS:
        # The prompt asks for 60 字; this only catches a model that
        # ignored it badly, so the chat never turns back into essays.
        argument = argument[: DIALOGUE_MAX_CHARS - 1].rstrip() + "…"
    turns.append(
        {
            "side": side,
            "speaker": "agent",
            "round": round_no,
            "mode": mode,
            "argument": argument,
            "key_points": (
                []
                if mode == "dialogue"
                else [str(p) for p in structured.get("key_points") or [] if p]
            ),
            "focus": focus,
        }
    )


def _next_round(turns: list[dict]) -> int:
    return max((t["round"] for t in turns), default=0) + 1


async def _debate_events(ctx: _Ctx, payload: DebateRoundRequest) -> EventStream:
    turns = list(ctx.project.debate or [])
    round_no = _next_round(turns)
    focus = (payload.focus or "").strip() or None

    for side in ("pro", "con"):
        async for item in _agent_turn(ctx, side, turns, round_no, focus, payload.mode):
            yield item

    # A new list, not an in-place append: SQLAlchemy only notices a JSON
    # column changed when it is reassigned.
    ctx.project.debate = turns
    yield ctx.done()


async def _reply_events(ctx: _Ctx, payload: DebateReplyRequest) -> EventStream:
    """The user says one line as 正方 or 反方, and the other side answers it.

    Always 對話: a person joining in speaks a line, not an essay. The user's
    line is stored before the agent is called, but only committed together
    with the answer — a failed reply leaves the debate as it was, so a retry
    doesn't post the same line twice.
    """
    text = payload.text.strip()
    if not text:
        raise HTTPException(400, "說點什麼再送出")
    turns = list(ctx.project.debate or [])
    round_no = _next_round(turns)
    turns.append(
        {
            "side": payload.side,
            "speaker": "user",
            "round": round_no,
            "mode": "dialogue",
            "argument": text,
            "key_points": [],
            "focus": None,
        }
    )
    other = "con" if payload.side == "pro" else "pro"
    async for item in _agent_turn(ctx, other, turns, round_no, None, "dialogue"):
        yield item
    ctx.project.debate = turns
    yield ctx.done()


_agent_route("debate", DebateRoundRequest, _debate_events)
_agent_route("debate/reply", DebateReplyRequest, _reply_events)


# 3. MVP — draft candidate features for the user to sort.


async def _features_events(ctx: _Ctx, _payload: ConvergenceAgentRequest) -> EventStream:
    out: list[dict] = []
    system_prompt, user_prompt, schema = build_features_prompt(ctx.text, ctx.project)
    async for item in ctx.ask(system_prompt, user_prompt, schema, out):
        yield item

    features = list(ctx.project.features or [])
    taken = {f["title"].strip().lower() for f in features}
    added = 0
    for raw in out[0].get("features") or []:
        title = str(raw.get("title") or "").strip()[:_MAX_TITLE]
        if not title or title.lower() in taken:
            continue
        taken.add(title.lower())
        features.append(
            {
                "id": uuid.uuid4().hex[:8],
                "title": title,
                "description": str(raw.get("description") or "").strip()[:_MAX_DESCRIPTION],
                "source": "ai",
                "moscow": None,
                "impact": None,
                "effort": None,
                "ai_impact": None,
                "ai_effort": None,
                "ai_rationale": None,
            }
        )
        added += 1
    if added == 0:
        raise HTTPException(502, "AI 沒有想出新的功能，請再試一次")
    ctx.project.features = features
    yield ctx.done()


_agent_route("features/suggest", ConvergenceAgentRequest, _features_events)


# 4. 效益 × 成本 — the agent's estimate, which the user then moves around.


def _rateable(ctx: _Ctx) -> None:
    if not any(f.get("moscow") not in (None, "wont") for f in ctx.project.features or []):
        raise HTTPException(400, "先把功能拖進 Must / Should / Could，才能估效益與成本")


async def _impact_effort_events(ctx: _Ctx, _payload: ConvergenceAgentRequest) -> EventStream:
    out: list[dict] = []
    system_prompt, user_prompt, schema = build_impact_effort_prompt(ctx.text, ctx.project)
    async for item in ctx.ask(system_prompt, user_prompt, schema, out):
        yield item

    estimates = {str(e.get("id")): e for e in out[0].get("estimates") or []}
    features = []
    hit = 0
    for f in ctx.project.features or []:
        f = dict(f)
        e = estimates.get(f["id"])
        if e is not None and f.get("moscow") != "wont":
            impact, effort = clamp_score(e.get("impact")), clamp_score(e.get("effort"))
            if impact is not None and effort is not None:
                hit += 1
                f["ai_impact"], f["ai_effort"] = impact, effort
                f["ai_rationale"] = str(e.get("rationale") or "").strip() or None
                # The AI's numbers are the starting position, never an
                # override: a feature the user already moved stays put.
                if f.get("impact") is None or f.get("effort") is None:
                    f["impact"], f["effort"] = impact, effort
        features.append(f)
    if hit == 0:
        raise HTTPException(502, "AI 沒有估出任何功能的效益與成本，請再試一次")
    ctx.project.features = features
    yield ctx.done()


_agent_route("impact-effort", ConvergenceAgentRequest, _impact_effort_events, _rateable)


# 5. 競品搜尋 — GitHub (any provider) + web (anthropic only), then a comparison.


async def _research_events(ctx: _Ctx, _payload: ConvergenceAgentRequest) -> EventStream:
    research: dict = {"searched_at": _now().isoformat()}

    yield event("text", text="\n\n### 想 GitHub 搜尋關鍵字\n")
    out: list[dict] = []
    system_prompt, user_prompt, schema = build_search_query_prompt(ctx.text, ctx.project)
    async for item in ctx.ask(system_prompt, user_prompt, schema, out):
        yield item
    queries = [q.strip() for q in out[0].get("queries") or [] if str(q).strip()][:3]
    research["queries"] = queries

    yield event("text", text=f"\n\n### 搜尋 GitHub：{'、'.join(queries) or '（沒有關鍵字）'}\n")
    hits: list[dict] = []
    if queries:
        try:
            hits = (await search_repositories(queries))[:12]
            yield event("text", text=f"找到 {len(hits)} 個相關專案。\n")
        except GitHubSearchError as exc:
            research["github_error"] = str(exc)
            yield event("text", text=f"（GitHub 搜尋失敗，略過：{exc}）\n")
    research["github"] = hits

    web_text, citations = None, []
    researcher = getattr(ctx.provider, "research", None)
    if researcher is None:
        research["web_skipped"] = "這個 provider 不支援網路搜尋，只查了 GitHub。"
        yield event("text", text="\n（這個 provider 不支援網路搜尋，略過）\n")
    else:
        yield event("text", text="\n\n### 網路搜尋競品\n")
        system_prompt, user_prompt = build_web_research_prompt(ctx.text, ctx.project)
        try:
            result = await researcher(
                query_system_prompt=system_prompt,
                query_user_prompt=user_prompt,
                model=ctx.model,
            )
        except ProviderError as exc:
            research["web_error"] = str(exc)
            yield event("text", text=f"（網路搜尋失敗，略過：{exc}）\n")
        else:
            log_llm_call(
                ctx.db,
                result,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                session_id=ctx.session.id if ctx.session else None,
            )
            web_text = result.text or None
            citations = (result.structured or {}).get("citations", [])
            if web_text:
                yield event("text", text=web_text + "\n")
    research["web_text"] = web_text
    research["web_citations"] = citations

    yield event("text", text="\n\n### 跟功能清單比對\n")
    out = []
    system_prompt, user_prompt, schema = build_research_summary_prompt(
        ctx.text, ctx.project, hits, web_text, citations
    )
    async for item in ctx.ask(system_prompt, user_prompt, schema, out):
        yield item
    summary = out[0]
    if not str(summary.get("summary") or "").strip():
        raise HTTPException(502, "AI 沒有整理出搜尋結果，請再試一次")
    # Only keep competitors whose link came out of the search itself — the
    # prompt asks for that, this is what makes it true.
    known_urls = {h["url"] for h in hits} | {c["url"] for c in citations}
    research["summary"] = str(summary.get("summary") or "").strip()
    research["competitors"] = [
        {
            "name": str(c.get("name") or "").strip(),
            "url": c.get("url") if c.get("url") in known_urls else None,
            "overlap": str(c.get("overlap") or "").strip(),
            "gap": str(c.get("gap") or "").strip(),
        }
        for c in summary.get("competitors") or []
        if str(c.get("name") or "").strip()
    ]
    research["differentiation"] = str(summary.get("differentiation") or "").strip()

    ctx.project.research = research
    yield ctx.done()


_agent_route("research", ConvergenceAgentRequest, _research_events)


# 6. 技術可行性與投入效益.


async def _feasibility_events(ctx: _Ctx, _payload: ConvergenceAgentRequest) -> EventStream:
    out: list[dict] = []
    system_prompt, user_prompt, schema = build_feasibility_prompt(ctx.text, ctx.project)
    async for item in ctx.ask(system_prompt, user_prompt, schema, out):
        yield item

    raw = out[0]
    technical = raw.get("technical") or {}
    investment = raw.get("investment") or {}
    if not (technical.get("rationale") or investment.get("rationale")):
        # An empty assessment saved as if it were one would read as "the AI
        # had nothing to say" rather than "the call failed".
        raise HTTPException(502, "AI 沒有給出可行性評估，請再試一次")
    ctx.project.feasibility = {
        "technical": {
            "score": clamp_score(technical.get("score")),
            "rationale": str(technical.get("rationale") or "").strip(),
            "risks": [str(r) for r in technical.get("risks") or [] if r],
            "suggested_stack": [str(s) for s in technical.get("suggested_stack") or [] if s],
        },
        "investment": {
            "score": clamp_score(investment.get("score")),
            "rationale": str(investment.get("rationale") or "").strip(),
            "effort_estimate": str(investment.get("effort_estimate") or "").strip(),
            "benefit": str(investment.get("benefit") or "").strip(),
        },
        "must_fit": str(raw.get("must_fit") or "").strip(),
        "open_questions": [str(q) for q in raw.get("open_questions") or [] if q],
        "evaluated_at": _now().isoformat(),
    }
    yield ctx.done()


_agent_route("feasibility", ConvergenceAgentRequest, _feasibility_events)
