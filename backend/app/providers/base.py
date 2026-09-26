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
    cost_usd: Optional[float]
    duration_ms: Optional[int]
    raw: str


class ProviderError(RuntimeError):
    """Raised when a local CLI provider fails to produce a usable result."""


class LLMProvider(Protocol):
    name: str
    label: str

    @property
    def default_model(self) -> Optional[str]:
        """Model used when the caller doesn't pick one (None = CLI's own default)."""
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
