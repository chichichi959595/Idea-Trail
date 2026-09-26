from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy import JSON, ForeignKey, String, Text
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
    has_existing_product: Mapped[Optional[bool]] = mapped_column(default=None)
    is_tech_driven: Mapped[Optional[bool]] = mapped_column(default=None)
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
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    session: Mapped[IdeationSession] = relationship(back_populates="recommendations")


class MethodRun(Base):
    __tablename__ = "method_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    method_name: Mapped[str] = mapped_column(String(50))
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    status: Mapped[str] = mapped_column(String(20), default="running")
    current_step_index: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[dt.datetime] = mapped_column(default=_now)
    finished_at: Mapped[Optional[dt.datetime]] = mapped_column(default=None)

    session: Mapped[IdeationSession] = relationship(back_populates="method_runs")
    steps: Mapped[list["MethodStep"]] = relationship(
        back_populates="method_run", cascade="all, delete-orphan", order_by="MethodStep.step_index"
    )
    ideas: Mapped[list["Idea"]] = relationship(back_populates="method_run")


class MethodStep(Base):
    __tablename__ = "method_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    method_run_id: Mapped[int] = mapped_column(ForeignKey("method_runs.id"))
    step_index: Mapped[int] = mapped_column()
    step_name: Mapped[str] = mapped_column(String(100))
    question_shown: Mapped[str] = mapped_column(Text)
    user_answer: Mapped[Optional[str]] = mapped_column(Text, default=None)
    agent_output_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    method_run: Mapped[MethodRun] = relationship(back_populates="steps")


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
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)

    method_run: Mapped[Optional[MethodRun]] = relationship(back_populates="ideas")


class LLMCall(Base):
    """Raw audit log of every local-CLI call — the traceability backbone."""

    __tablename__ = "llm_calls"

    id: Mapped[int] = mapped_column(primary_key=True)
    related_step_id: Mapped[Optional[int]] = mapped_column(ForeignKey("method_steps.id"), default=None)
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sessions.id"), default=None)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    system_prompt: Mapped[str] = mapped_column(Text)
    user_prompt: Mapped[str] = mapped_column(Text)
    response_text: Mapped[str] = mapped_column(Text)
    structured_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    cost_usd: Mapped[Optional[float]] = mapped_column(default=None)
    duration_ms: Mapped[Optional[int]] = mapped_column(default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now)
