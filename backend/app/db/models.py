from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy import JSON, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class IdeationSession(Base):
    """A single ideation workspace: one team's basic info + everything derived from it."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_size: Mapped[Optional[int]] = mapped_column(default=None)
    time_budget: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    tech_background: Mapped[Optional[str]] = mapped_column(Text, default=None)
    domain_pref: Mapped[Optional[str]] = mapped_column(Text, default=None)
    constraints_text: Mapped[Optional[str]] = mapped_column(Text, default=None)
    has_clear_problem: Mapped[Optional[bool]] = mapped_column(default=None)
    clear_problem_text: Mapped[Optional[str]] = mapped_column(Text, default=None)
    """What the problem actually is, asked only when has_clear_problem is true."""
    has_existing_product: Mapped[Optional[bool]] = mapped_column(default=None)
    existing_product_text: Mapped[Optional[str]] = mapped_column(Text, default=None)
    """Which product/topic they want to rework, asked only when has_existing_product is true."""
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    recommendations: Mapped[list["MethodRecommendation"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    method_runs: Mapped[list["MethodRun"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class MethodRecommendation(Base):
    __tablename__ = "method_recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    method: Mapped[str] = mapped_column(String(50))
    rank: Mapped[int] = mapped_column()
    rationale: Mapped[str] = mapped_column(Text)
    stage: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    """"discovery" for a 痛點發想 recommendation. None is 專案發想 — every row
    written before the two stages each had their own list."""
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    session: Mapped[IdeationSession] = relationship(back_populates="recommendations")


class MethodRun(Base):
    __tablename__ = "method_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    method_name: Mapped[str] = mapped_column(String(50))
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    """The model for this run's convergence call — the one whose reasoning
    decides what the team walks away with."""
    step_model: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    """The model for this run's per-step agents. None falls back to `model`,
    which is what every run created before this column existed did."""
    status: Mapped[str] = mapped_column(String(20), default="running")
    current_step_index: Mapped[int] = mapped_column(default=0)
    """For a relay run, the round everyone is currently writing."""
    started_at: Mapped[dt.datetime] = mapped_column(default=_now)
    finished_at: Mapped[Optional[dt.datetime]] = mapped_column(default=None)

    mode: Mapped[str] = mapped_column(String(10), default="solo", server_default="solo")
    """"solo" = one user walks the method's steps; "relay" = 多人接龍, where
    the answers live in `relay_cells` instead of `steps`. A relay run's status
    goes lobby → writing → revealed rather than running → done."""
    join_code: Mapped[Optional[str]] = mapped_column(String(10), default=None, index=True)
    relay_rungs: Mapped[Optional[list]] = mapped_column(JSON, default=None)
    """The question ladder, snapshotted when the run starts — [{question, role,
    timer_seconds}], one per round. Frozen for the same reason question_shown
    is: a room mid-activity shouldn't see its questions change underneath it."""
    relay_round_started_at: Mapped[Optional[dt.datetime]] = mapped_column(default=None)
    """When the current round's questions went out. The deadline is this plus
    that rung's timer_seconds."""
    pain_point_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("pain_points.id"), default=None
    )
    """For an ideation run, the pain point it sets out to solve; None = the
    team went in without one. For a discovery run, always None — the pain
    points it finds point back at it instead (`PainPoint.method_run_id`)."""

    session: Mapped[IdeationSession] = relationship(back_populates="method_runs")
    steps: Mapped[list["MethodStep"]] = relationship(
        back_populates="method_run", cascade="all, delete-orphan", order_by="MethodStep.step_index"
    )
    ideas: Mapped[list["Idea"]] = relationship(back_populates="method_run")
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="method_run", cascade="all, delete-orphan", order_by="Participant.seat_index"
    )
    relay_cells: Mapped[list["RelayCell"]] = relationship(
        back_populates="method_run", cascade="all, delete-orphan"
    )


class MethodStep(Base):
    __tablename__ = "method_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    method_run_id: Mapped[int] = mapped_column(ForeignKey("method_runs.id"))
    step_index: Mapped[int] = mapped_column()
    step_name: Mapped[str] = mapped_column(String(100))
    question_shown: Mapped[str] = mapped_column(Text)
    timer_seconds: Mapped[Optional[int]] = mapped_column(default=None)
    """Snapshotted from the StepSpec, like question_shown — so an in-flight run
    keeps the pacing it started with even if the method is later retuned."""
    user_answer: Mapped[Optional[str]] = mapped_column(Text, default=None)
    agent_output_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    method_run: Mapped[MethodRun] = relationship(back_populates="steps")


class Participant(Base):
    """One phone in a relay run. No account — the token is the whole identity,
    kept in the phone's localStorage so a reload lands back in the same seat."""

    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    method_run_id: Mapped[int] = mapped_column(ForeignKey("method_runs.id"))
    display_name: Mapped[str] = mapped_column(String(50))
    seat_index: Mapped[int] = mapped_column()
    """Handed out in join order and frozen at start — the rotation rule is
    built entirely on this number."""
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    """Secret, unlike `id`: a sequential id would let anyone read another
    seat's paper by counting."""
    joined_at: Mapped[dt.datetime] = mapped_column(default=_now)

    method_run: Mapped[MethodRun] = relationship(back_populates="participants")


class RelayCell(Base):
    """One square of the relay grid: which chain, which round, who wrote it."""

    __tablename__ = "relay_cells"
    __table_args__ = (UniqueConstraint("method_run_id", "chain_index", "round_index"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    method_run_id: Mapped[int] = mapped_column(ForeignKey("method_runs.id"))
    chain_index: Mapped[int] = mapped_column()
    round_index: Mapped[int] = mapped_column()
    participant_id: Mapped[int] = mapped_column(ForeignKey("participants.id"))
    answer_text: Mapped[Optional[str]] = mapped_column(Text, default=None)
    """None = the timer ran out with nothing written. The next person gets a
    paper with a gap in it and carries on."""
    flagged_unclear: Mapped[bool] = mapped_column(default=False)
    """Someone further down the chain pressed 「這個我看不懂」 on this square."""
    submitted_at: Mapped[Optional[dt.datetime]] = mapped_column(default=None)
    latency_ms: Mapped[Optional[int]] = mapped_column(default=None)
    """Question shown → submitted. The square someone sat on longest is
    usually the one they thought hardest about."""

    method_run: Mapped[MethodRun] = relationship(back_populates="relay_cells")
    participant: Mapped[Participant] = relationship()


class Idea(Base):
    __tablename__ = "ideas"

    id: Mapped[int] = mapped_column(primary_key=True)
    method_run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("method_runs.id"), default=None)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    source_method: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    is_synthesized: Mapped[bool] = mapped_column(default=False)
    parent_idea_ids: Mapped[Optional[list]] = mapped_column(JSON, default=None)
    pain_point_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("pain_points.id"), default=None
    )
    """Copied from the run that produced it, so the idea library can link
    ideas by the problem they solve. A synthesized idea keeps it only when
    every parent agrees — a merge across problems belongs to none of them."""
    size: Mapped[Optional[str]] = mapped_column(String(1), default=None)
    """How big a project this is, set by the user in the idea library:
    "s" / "m" / "l". None = not set yet, drawn as medium."""
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    method_run: Mapped[Optional[MethodRun]] = relationship(back_populates="ideas")


class PainPoint(Base):
    """One problem worth solving, in the pain point library.

    The library spans sessions on purpose: a problem found by one team is a
    starting point another team can pick up. `session_id` only records where
    it came from.
    """

    __tablename__ = "pain_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sessions.id"), default=None)
    statement: Mapped[str] = mapped_column(Text)
    """The problem in one sentence."""
    who: Mapped[Optional[str]] = mapped_column(Text, default=None)
    context: Mapped[Optional[str]] = mapped_column(Text, default=None)
    """When / where it happens."""
    current_workaround: Mapped[Optional[str]] = mapped_column(Text, default=None)
    source: Mapped[str] = mapped_column(String(20), default="manual")
    """"setup" = written on the setup screen; "discovery" = found in a 痛點發想
    run; "manual" = typed straight into the library."""
    method_run_id: Mapped[Optional[int]] = mapped_column(
        # use_alter breaks the cycle with MethodRun.pain_point_id, which would
        # otherwise leave the two tables with no creation order.
        ForeignKey("method_runs.id", use_alter=True),
        default=None,
    )
    """The discovery run that surfaced it, for source == "discovery"."""
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class IdeaLink(Base):
    """An AI-judged "these two ideas are related" edge for the idea library
    graph. Structural links (same run, same pain point, merged from) are
    derived from the ideas themselves and never stored; these are the ones
    that can't be, so they are stored and replaced wholesale on each analysis.
    Stored with idea_a_id < idea_b_id, so a pair has one spelling."""

    __tablename__ = "idea_links"
    __table_args__ = (UniqueConstraint("idea_a_id", "idea_b_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    idea_a_id: Mapped[int] = mapped_column(ForeignKey("ideas.id"))
    idea_b_id: Mapped[int] = mapped_column(ForeignKey("ideas.id"))
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class PainPointLink(Base):
    """The pain point library's AI-judged links — same role as IdeaLink, for
    the other graph. Stored with pain_point_a_id < pain_point_b_id."""

    __tablename__ = "pain_point_links"
    __table_args__ = (UniqueConstraint("pain_point_a_id", "pain_point_b_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pain_point_a_id: Mapped[int] = mapped_column(ForeignKey("pain_points.id"))
    pain_point_b_id: Mapped[int] = mapped_column(ForeignKey("pain_points.id"))
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)


class ConvergenceProject(Base):
    """One idea taken through 專案收斂, from 需求分析 to the go/no-go call.

    Each stage's output is one JSON column, written whole: the stages are
    walked in order but can be revisited, and a stage re-run replaces what it
    wrote last time rather than piling up versions. The AI's half and the
    user's half are kept in separate fields throughout — the agents give
    reasons, the user makes the call (demand_verdict, the MoSCoW buckets,
    decision).
    """

    __tablename__ = "convergence_projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    idea_id: Mapped[int] = mapped_column(ForeignKey("ideas.id"), unique=True, index=True)
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sessions.id"), default=None)
    """Whose team context the agents argue against — the session the user was
    in when they started converging, not necessarily the idea's own."""

    debate: Mapped[Optional[list]] = mapped_column(JSON, default=None)
    """[{side: "pro"|"con", round, argument, key_points, focus}] in speaking
    order. Grows by one pro + one con turn each time the user asks for
    another round."""
    demand_verdict: Mapped[Optional[str]] = mapped_column(String(10), default=None)
    """The user's call after the debate: "real" / "unsure" / "not_real"."""
    demand_notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    features: Mapped[Optional[list]] = mapped_column(JSON, default=None)
    """[{id, title, description, source: "ai"|"user", moscow, impact, effort,
    ai_impact, ai_effort, ai_rationale}]. `moscow` is None until the user
    drags it into a bucket; impact/effort are the user's placement on the
    matrix, ai_* the agent's estimate it started from."""

    research: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    """GitHub hits, web citations and the agent's comparison against the
    features — see `app.api.convergence._research_events`."""

    feasibility: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    """The agent's 技術可行性 + 投入效益 assessment."""
    decision: Mapped[Optional[str]] = mapped_column(String(10), default=None)
    """The user's final call: "go" / "pivot" / "drop"."""
    decision_notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    created_at: Mapped[dt.datetime] = mapped_column(default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(default=_now)


class LLMCall(Base):
    """Raw audit log of every local-CLI call — the traceability backbone."""

    __tablename__ = "llm_calls"

    id: Mapped[int] = mapped_column(primary_key=True)
    related_step_id: Mapped[Optional[int]] = mapped_column(ForeignKey("method_steps.id"), default=None)
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sessions.id"), default=None)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    """The alias that was requested — matches MethodRun.model."""
    resolved_model: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    """The concrete model the CLI says it ran, when it tells us."""
    system_prompt: Mapped[str] = mapped_column(Text)
    user_prompt: Mapped[str] = mapped_column(Text)
    response_text: Mapped[str] = mapped_column(Text)
    structured_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    cost_usd: Mapped[Optional[float]] = mapped_column(default=None)
    duration_ms: Mapped[Optional[int]] = mapped_column(default=None)
    """Wall clock, start to finish."""
    api_duration_ms: Mapped[Optional[int]] = mapped_column(default=None)
    """Of that, the part the provider attributes to the model call itself.
    The gap between the two is process/harness overhead."""
    input_tokens: Mapped[Optional[int]] = mapped_column(default=None)
    output_tokens: Mapped[Optional[int]] = mapped_column(default=None)
    """The number to look at first when a call was slow — on every provider
    here, latency tracks generated tokens, not prompt length."""
    thinking_tokens: Mapped[Optional[int]] = mapped_column(default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)
