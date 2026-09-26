from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session as DbSession

from app.db.models import LLMCall
from app.providers.base import LLMResult


def log_llm_call(
    db: DbSession,
    result: LLMResult,
    *,
    system_prompt: str,
    user_prompt: str,
    session_id: Optional[int] = None,
    related_step_id: Optional[int] = None,
) -> LLMCall:
    call = LLMCall(
        related_step_id=related_step_id,
        session_id=session_id,
        provider=result.provider,
        model=result.model,
        resolved_model=result.resolved_model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_text=result.text,
        structured_json=result.structured,
        cost_usd=result.cost_usd,
        duration_ms=result.duration_ms,
    )
    db.add(call)
    db.flush()
    return call
