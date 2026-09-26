from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


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

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[dict] = None,
        model: Optional[str] = None,
    ) -> LLMResult: ...

    async def health(self) -> dict: ...
