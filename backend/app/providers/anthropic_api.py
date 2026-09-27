from __future__ import annotations

import json
import os
import time
from typing import Optional

from typing import AsyncIterator

from .base import LLMResult, ModelOption, ProviderError, StreamEvent

_MODELS = [
    ModelOption("claude-opus-5", "Opus 5", "推理最強、思考最深，這裡的預設值"),
    ModelOption("claude-sonnet-5", "Sonnet 5", "速度與品質的平衡點，步驟多的方法用這個"),
    ModelOption("claude-haiku-4-5", "Haiku 4.5", "最快最省，但思考深度明顯較淺"),
]
_DEFAULT_MODEL = "claude-opus-5"
# The step agents judge whether an answer is on topic and jot a couple of
# fragments. That does not need Opus, and it runs six or more times a run.
_DEFAULT_STEP_MODEL = "claude-sonnet-5"

_MAX_TOKENS = 16000

# Per-million-token list prices, used to fill LLMResult.cost_usd. The CLI
# providers get this figure for free from their own output; here it has to be
# computed, and without it the llm_calls log can't compare the two routes.
_PRICES = {
    "claude-opus-5": (5.00, 25.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-haiku-4-5": (1.00, 5.00),
}

# Haiku 4.5 predates adaptive thinking and rejects `output_config.effort`, so
# it needs the older fixed-budget form. Everything else takes `adaptive` and
# decides its own depth.
_HAIKU_THINKING_BUDGET = 4000

# Structured outputs accept only a subset of JSON Schema. These keywords are
# rejected rather than ignored, so they're stripped before the request — the
# callers that care (the finalize step's 2~4 idea range) also state the range
# in the prompt text and filter the result afterwards.
_UNSUPPORTED_SCHEMA_KEYS = frozenset(
    {"minItems", "maxItems", "minimum", "maximum", "multipleOf", "minLength", "maxLength"}
)


def _sanitize_schema(node):
    if isinstance(node, dict):
        return {k: _sanitize_schema(v) for k, v in node.items() if k not in _UNSUPPORTED_SCHEMA_KEYS}
    if isinstance(node, list):
        return [_sanitize_schema(v) for v in node]
    return node


def _request_kwargs(
    *, system_prompt: str, user_prompt: str, json_schema: Optional[dict], model: str
) -> dict:
    """The request body, built once so `complete` and `stream` stay identical."""
    kwargs = {
        "model": model,
        "max_tokens": _MAX_TOKENS,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
        "thinking": _thinking_for(model),
    }
    if json_schema is not None:
        kwargs["output_config"] = {
            "format": {"type": "json_schema", "schema": _sanitize_schema(json_schema)}
        }
    return kwargs


def _thinking_for(model: str) -> dict:
    if model == "claude-haiku-4-5":
        return {"type": "enabled", "budget_tokens": _HAIKU_THINKING_BUDGET}
    # `display: summarized` so the reasoning is actually returned; the default
    # on these models is to send thinking blocks with the text stripped out.
    return {"type": "adaptive", "display": "summarized"}


def _usage_figures(usage) -> dict:
    if usage is None:
        return {}
    details = getattr(usage, "output_tokens_details", None)
    fresh = getattr(usage, "input_tokens", None) or 0
    cached_read = getattr(usage, "cache_read_input_tokens", None) or 0
    cached_write = getattr(usage, "cache_creation_input_tokens", None) or 0
    return {
        "input_tokens": fresh + cached_read + cached_write or None,
        "output_tokens": getattr(usage, "output_tokens", None),
        "thinking_tokens": getattr(details, "thinking_tokens", None),
    }


def _cost_usd(model: str, usage) -> Optional[float]:
    price = _PRICES.get(model)
    if price is None or usage is None:
        return None
    in_per_m, out_per_m = price
    cached_read = getattr(usage, "cache_read_input_tokens", None) or 0
    cached_write = getattr(usage, "cache_creation_input_tokens", None) or 0
    fresh = getattr(usage, "input_tokens", None) or 0
    output = getattr(usage, "output_tokens", None) or 0
    billed_input = fresh + cached_write * 1.25 + cached_read * 0.1
    return (billed_input * in_per_m + output * out_per_m) / 1_000_000


class AnthropicAPIProvider:
    """Calls the Anthropic Messages API directly with an ANTHROPIC_API_KEY.

    The other two providers shell out to a local coding-agent CLI and borrow
    that CLI's subscription quota. Convenient, but a CLI is an agent harness,
    not an inference endpoint: it wraps every call in its own system prompt and
    internal iterations, so a ~700-token prompt asking for a ~400-token answer
    comes back after thousands of generated tokens. This provider sends the
    prompt and nothing else, which is why it is the fast route — and why it
    bills a real API key instead of a subscription.
    """

    name = "anthropic"
    label = "Anthropic API"
    speed_tier = "fast"
    speed_note = "直接呼叫 API，通常幾秒內回應；用 API key 計費。"

    @property
    def default_model(self) -> str:
        return _DEFAULT_MODEL

    @property
    def default_step_model(self) -> str:
        return _DEFAULT_STEP_MODEL

    def list_models(self) -> list[ModelOption]:
        return list(_MODELS)

    def _client(self):
        # Imported lazily so the other providers still work on a machine that
        # never installed the SDK.
        try:
            from anthropic import AsyncAnthropic
        except ImportError as exc:  # pragma: no cover - depends on the install
            raise ProviderError(
                "anthropic SDK not installed — run `uv sync` (or `pip install anthropic`)"
            ) from exc
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise ProviderError("ANTHROPIC_API_KEY is not set in this backend's environment")
        return AsyncAnthropic()

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[dict] = None,
        model: Optional[str] = None,
    ) -> LLMResult:
        import anthropic

        model = model or _DEFAULT_MODEL
        client = self._client()

        kwargs = _request_kwargs(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=json_schema,
            model=model,
        )

        started = time.monotonic()
        try:
            # Streamed so a long thinking pass can't trip the SDK's HTTP
            # timeout; only the finished message is used.
            async with client.messages.stream(**kwargs) as stream:
                message = await stream.get_final_message()
        except anthropic.APIStatusError as exc:
            raise ProviderError(f"Anthropic API returned {exc.status_code}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderError(f"could not reach the Anthropic API: {exc}") from exc
        duration_ms = int((time.monotonic() - started) * 1000)

        return self._to_result(message, model, json_schema, duration_ms)

    async def stream(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[dict] = None,
        model: Optional[str] = None,
    ) -> AsyncIterator[StreamEvent]:
        """Same call as `complete`, but surfacing the reasoning as it arrives.

        For an ideation tool the thinking is not just a progress bar — it is the
        part of the answer that explains itself — which is why the requests ask
        for `display: "summarized"` rather than leaving thinking blocks empty.
        """
        import anthropic

        model = model or _DEFAULT_MODEL
        client = self._client()
        kwargs = _request_kwargs(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=json_schema,
            model=model,
        )

        started = time.monotonic()
        try:
            async with client.messages.stream(**kwargs) as stream:
                async for event in stream:
                    if event.type != "content_block_delta":
                        continue
                    delta = event.delta
                    if delta.type == "thinking_delta":
                        yield StreamEvent("thinking", text=delta.thinking)
                    elif delta.type == "text_delta":
                        yield StreamEvent("text", text=delta.text)
                message = await stream.get_final_message()
        except anthropic.APIStatusError as exc:
            raise ProviderError(f"Anthropic API returned {exc.status_code}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderError(f"could not reach the Anthropic API: {exc}") from exc

        duration_ms = int((time.monotonic() - started) * 1000)
        yield StreamEvent(
            "result", result=self._to_result(message, model, json_schema, duration_ms)
        )

    def _to_result(
        self, message, model: str, json_schema: Optional[dict], duration_ms: int
    ) -> LLMResult:
        if message.stop_reason == "refusal":
            raise ProviderError("Anthropic API declined this request (stop_reason=refusal)")

        text = "".join(block.text for block in message.content if block.type == "text")

        structured = None
        if json_schema is not None:
            try:
                structured = json.loads(text)
            except json.JSONDecodeError:
                # output_config.format normally guarantees valid JSON; a
                # max_tokens cut-off is the way it still comes back broken.
                structured = None

        return LLMResult(
            text=text,
            structured=structured,
            provider=self.name,
            model=model,
            resolved_model=message.model,
            cost_usd=_cost_usd(model, message.usage),
            duration_ms=duration_ms,
            raw=message.to_json(),
            # No api_duration_ms: there is no harness between this and the
            # model, so duration_ms already *is* the API time.
            **_usage_figures(message.usage),
        )

    async def health(self) -> dict:
        try:
            client = self._client()
        except ProviderError as exc:
            return {"ok": False, "detail": str(exc)}

        import anthropic

        try:
            await client.models.retrieve(_DEFAULT_MODEL)
        except anthropic.AuthenticationError:
            return {"ok": False, "detail": "ANTHROPIC_API_KEY 被拒絕，檢查一下 key 是否正確或已停用"}
        except anthropic.APIError as exc:
            return {"ok": False, "detail": f"無法驗證 API key: {exc}"}

        return {"ok": True, "authMethod": "ANTHROPIC_API_KEY"}
