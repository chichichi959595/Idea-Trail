from __future__ import annotations

import logging
from typing import Optional

from .base import LLMProvider, LLMResult

logger = logging.getLogger(__name__)


def _strings_in(obj) -> list:
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        out = []
        for v in obj.values():
            out += _strings_in(v)
        return out
    if isinstance(obj, list):
        out = []
        for v in obj:
            out += _strings_in(v)
        return out
    return []


def looks_degenerate(structured: Optional[dict]) -> bool:
    """Heuristic for placeholder-ish output (e.g. "測試"/"A"/"B") that the
    underlying CLI occasionally returns instead of real content.

    A deliberately empty string (e.g. "analysis" when a step rejects an
    off-topic answer) is not degenerate — only short-but-nonempty filler is.
    """
    if not structured:
        return True
    strings = _strings_in(structured)
    if not strings:
        return True
    return any(0 < len(s.strip()) < 6 for s in strings)


async def complete_with_quality_guard(provider: LLMProvider, **kwargs) -> LLMResult:
    """Calls provider.complete and retries once if the structured result looks
    like placeholder filler rather than a real answer."""
    result = await provider.complete(**kwargs)
    if kwargs.get("json_schema") is not None and looks_degenerate(result.structured):
        # Only the retry's result gets logged to llm_calls, so without this
        # line a retried call just looks like one inexplicably slow call —
        # which is exactly what makes a "fast" model look slow.
        logger.warning(
            "quality guard: %s/%s returned placeholder-ish output after %sms — retrying",
            result.provider,
            result.model,
            result.duration_ms,
        )
        result = await provider.complete(**kwargs)
    return result
