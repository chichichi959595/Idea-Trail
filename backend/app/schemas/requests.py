from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    team_size: Optional[int] = None
    time_budget: Optional[str] = None
    tech_background: Optional[str] = None
    domain_pref: Optional[str] = None
    constraints_text: Optional[str] = None
    has_clear_problem: Optional[bool] = None
    clear_problem_text: Optional[str] = None
    has_existing_product: Optional[bool] = None
    existing_product_text: Optional[str] = None


class CreateMethodRunRequest(BaseModel):
    method_name: str
    provider: str = "claude"
    model: Optional[str] = None
    """Model for the convergence call. None = the provider's own default."""
    step_model: Optional[str] = None
    """Model for the per-step agents. None = the provider's own step default,
    which is a tier below `model` where the provider offers one."""
    pain_point_id: Optional[int] = None
    """The pain point this run sets out to solve. Ignored for a discovery run."""


class AnswerStepRequest(BaseModel):
    step_index: int
    answer: str
    force: bool = False


class SynthesizeRequest(BaseModel):
    idea_ids: list[int]
    provider: str = "claude"
    model: Optional[str] = None


class PainPointRequest(BaseModel):
    statement: str
    who: Optional[str] = None
    context: Optional[str] = None
    current_workaround: Optional[str] = None
    session_id: Optional[int] = None
    """Where it was written, when that was inside a session. Only read on create."""


class UpdateIdeaRequest(BaseModel):
    size: Optional[Literal["s", "m", "l"]] = None
    """None clears it back to "not set"."""


class AnalyzeLinksRequest(BaseModel):
    provider: str = "claude"
    model: Optional[str] = None


class PainCheckRequest(BaseModel):
    statement: str
    provider: str = "claude"
    model: Optional[str] = None
    """The step model picked on the setup screen; empty means the provider's
    own step default."""


class CreateConvergenceRequest(BaseModel):
    idea_id: int
    session_id: Optional[int] = None
    """The session the user is in — whose team context the agents argue
    against. None falls back to the idea's own session."""


class UpdateConvergenceRequest(BaseModel):
    """A partial update of the user's half: only the fields actually sent are
    touched, so None can mean "clear it"."""

    demand_verdict: Optional[Literal["real", "unsure", "not_real"]] = None
    demand_notes: Optional[str] = None
    features: Optional[list[dict]] = None
    """The whole list, as the screen holds it after an edit or a drag."""
    debate: Optional[list[dict]] = None
    """Only ever sent as [] / None, to start the debate over."""
    decision: Optional[Literal["go", "pivot", "drop"]] = None
    decision_notes: Optional[str] = None


class ConvergenceAgentRequest(BaseModel):
    provider: str = "claude"
    model: Optional[str] = None


class DebateRoundRequest(ConvergenceAgentRequest):
    mode: Literal["dialogue", "analysis"] = "dialogue"
    """對話: each side says one line. 分析: each side writes a full argument."""
    focus: Optional[str] = None
    """What the user wants this round to dig into, e.g. 「學生真的願意付費嗎」."""


class DebateReplyRequest(ConvergenceAgentRequest):
    """The user joins the 對話 on one side; the agent on the other side answers."""

    side: Literal["pro", "con"]
    text: str = Field(min_length=1, max_length=300)
