from __future__ import annotations

from typing import Dict

from .base import LLMProvider
from .claude_code import ClaudeCodeProvider
from .codex import CodexProvider

_PROVIDERS: Dict[str, LLMProvider] = {
    "claude": ClaudeCodeProvider(),
    "codex": CodexProvider(),
}

DEFAULT_PROVIDER = "claude"


def get_provider(name: str) -> LLMProvider:
    try:
        return _PROVIDERS[name]
    except KeyError as exc:
        raise ValueError(f"unknown provider: {name!r}") from exc


async def health_report() -> dict:
    return {name: await provider.health() for name, provider in _PROVIDERS.items()}
