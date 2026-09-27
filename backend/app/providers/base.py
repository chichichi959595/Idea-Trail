from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass(frozen=True)
class ModelOption:
    """One model a provider can be asked to run, as offered in the UI."""

    id: str
    """Exactly what gets passed to the CLI's model flag."""
    label: str
    description: str = ""


@dataclass
class LLMResult:
    text: str
    structured: Optional[dict]
    provider: str
    model: Optional[str]
    """The model as *requested* — the same alias stored on MethodRun.model, so
    a run and its logged calls can always be matched up."""
    cost_usd: Optional[float]
    duration_ms: Optional[int]
    """Wall-clock for the whole call, including any process startup."""
    raw: str
    resolved_model: Optional[str] = None
    """The concrete model the CLI reports having actually run (e.g.
    "claude-sonnet-5" behind the "sonnet" alias). Recorded separately because
    an alias points at a different model over time."""

    # Token counts and the model's own share of the wall clock. Latency on
    # every one of these routes tracks output_tokens almost linearly, so
    # without these four fields the call log can record *that* something was
    # slow but never *why* — which is exactly how prompt length gets blamed for
    # a cost that is actually generated tokens. None means the provider has no
    # figure to give, not zero.
    input_tokens: Optional[int] = None
    """Total billed input: fresh tokens plus cache reads and cache writes."""
    output_tokens: Optional[int] = None
    """Everything the model generated, thinking included."""
    thinking_tokens: Optional[int] = None
    """The thinking share of output_tokens, when the provider breaks it out."""
    api_duration_ms: Optional[int] = None
    """Time inside the model call, where the provider can separate that from
    its own overhead. Set only by the CLI providers, which have overhead worth
    separating; `duration_ms` is already the API time for a direct call."""


@dataclass
class StreamEvent:
    """One thing worth telling the browser about while a call is in flight.

    `thinking` and `text` carry incremental output; exactly one `result` event
    ends every stream. Providers that cannot stream emit only the `result`, so
    a caller never needs to know which kind of provider it has.
    """

    kind: str
    """"thinking", "text" or "result"."""
    text: str = ""
    result: Optional["LLMResult"] = None


class ProviderError(RuntimeError):
    """Raised when a local CLI provider fails to produce a usable result."""


class LLMProvider(Protocol):
    name: str
    label: str
    speed_tier: str
    """"fast" or "slow", surfaced in the picker. Not a benchmark — it says
    whether this route talks to the API directly or goes through a coding-agent
    CLI, which is the difference between a few seconds and tens of seconds."""
    speed_note: str
    """One sentence telling the user what that choice costs them."""

    @property
    def default_model(self) -> Optional[str]:
        """Model for the calls whose quality decides the output: method
        selection, convergence, synthesis. None = the CLI's own default."""
        ...

    @property
    def default_step_model(self) -> Optional[str]:
        """Model for the per-step agents, which do a relevance check and jot
        one or two fragments. A tier below `default_model` where the provider
        has one to step down to — the step agents are called six or more times
        per run, so this is where depth is worth trading for speed."""
        ...

    def list_models(self) -> list[ModelOption]:
        """Models this provider will accept, best-first. May be empty if the
        local CLI gives us nothing to enumerate."""
        ...

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[dict] = None,
        model: Optional[str] = None,
    ) -> LLMResult: ...

    async def health(self) -> dict: ...
