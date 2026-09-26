from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


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


class AnswerStepRequest(BaseModel):
    step_index: int
    answer: str
    force: bool = False


class SynthesizeRequest(BaseModel):
    idea_ids: list[int]
    provider: str = "claude"
