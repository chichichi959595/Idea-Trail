"""The setup screen's pain point check — see `app.agents.pain_check`.

Not tied to a session: it runs before the setup screen has saved anything,
on whatever is in the form at that moment.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.agents.pain_check import build_pain_check_prompt, interpret_pain_check
from app.db.llm_log import log_llm_call
from app.db.session import get_db
from app.providers.base import ProviderError
from app.providers.registry import get_provider, resolve_step_model
from app.schemas.requests import PainCheckRequest

router = APIRouter(tags=["pain-check"])


@router.post("/pain-check")
async def check_pain_point(payload: PainCheckRequest, db: DbSession = Depends(get_db)):
    statement = payload.statement.strip()
    if not statement:
        raise HTTPException(400, "痛點是空的")
    # The step model, not the headline one: this is a quick sort into three
    # bins with a sentence of feedback — the same weight of call as a step
    # agent's relevance check — and the team is waiting on it to turn a page.
    try:
        provider = get_provider(payload.provider)
        model = resolve_step_model(payload.provider, payload.model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    system_prompt, user_prompt, schema = build_pain_check_prompt(statement)
    try:
        result = await provider.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=schema,
            model=model,
        )
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc

    log_llm_call(db, result, system_prompt=system_prompt, user_prompt=user_prompt)
    db.commit()
    return interpret_pain_check(result.structured)
