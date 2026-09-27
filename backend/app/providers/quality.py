from __future__ import annotations

import logging
from typing import AsyncIterator, Optional

from .base import LLMProvider, LLMResult, ProviderError, StreamEvent

logger = logging.getLogger(__name__)


def looks_degenerate(structured: Optional[dict]) -> bool:
    """True when the call produced no usable structured output at all.

    This used to also reject any result containing a short-but-nonempty string,
    to catch placeholder filler ("測試"/"A"/"B") from the CLI providers. Measured
    against 121 logged calls that heuristic fired on exactly one — an early
    row — while every false positive costs a silent second call, i.e. double
    the latency on the slowest thing in the app, recorded nowhere because only
    the retry gets logged. The providers now constrain output against the JSON
    schema, which is a far stronger guarantee than a length check, so the gate
    is down to the one case it can still catch cheaply and correctly: nothing
    came back.
    """
    return not structured


async def complete_with_quality_guard(provider: LLMProvider, **kwargs) -> LLMResult:
    """Calls provider.complete and retries once if the structured result is
    unusable."""
    result = await provider.complete(**kwargs)
    if kwargs.get("json_schema") is not None and looks_degenerate(result.structured):
        first_duration_ms = result.duration_ms
        logger.warning(
            "quality guard: %s/%s returned no structured output after %sms — retrying",
            result.provider,
            result.model,
            first_duration_ms,
        )
        result = await provider.complete(**kwargs)
        # The retry is what gets logged to llm_calls, so without folding the
        # first attempt's time in, a retried call reads as one inexplicably
        # slow call — which is what makes a fast model look slow.
        if first_duration_ms and result.duration_ms:
            result.duration_ms += first_duration_ms
    return result


async def stream_with_quality_guard(provider: LLMProvider, **kwargs) -> AsyncIterator[StreamEvent]:
    """Same contract as `complete_with_quality_guard`, as a stream of events.

    A provider that implements `stream` has its deltas passed through; one that
    doesn't emits a single `result` event, so a caller never branches on which
    kind it was handed. The retry still applies either way — it just can't be
    streamed, since by the time the output is known to be unusable the deltas
    for it have already gone out.
    """
    streamer = getattr(provider, "stream", None)
    if streamer is None:
        yield StreamEvent("result", result=await complete_with_quality_guard(provider, **kwargs))
        return

    result: Optional[LLMResult] = None
    async for event in streamer(**kwargs):
        if event.kind == "result":
            result = event.result
        else:
            yield event

    if result is None:  # pragma: no cover - a provider that ends without a result
        raise ProviderError(f"{provider.name} stream ended without a result")

    if kwargs.get("json_schema") is not None and looks_degenerate(result.structured):
        first_duration_ms = result.duration_ms
        logger.warning(
            "quality guard: %s/%s streamed no structured output after %sms — retrying unstreamed",
            result.provider,
            result.model,
            first_duration_ms,
        )
        result = await provider.complete(**kwargs)
        if first_duration_ms and result.duration_ms:
            result.duration_ms += first_duration_ms

    yield StreamEvent("result", result=result)
