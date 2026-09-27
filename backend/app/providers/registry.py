from __future__ import annotations

import asyncio
from dataclasses import asdict
from typing import Dict, Optional

from .anthropic_api import AnthropicAPIProvider
from .base import LLMProvider, ModelOption
from .claude_code import ClaudeCodeProvider
from .codex import CodexProvider

_PROVIDERS: Dict[str, LLMProvider] = {
    "anthropic": AnthropicAPIProvider(),
    "claude": ClaudeCodeProvider(),
    "codex": CodexProvider(),
}

DEFAULT_PROVIDER = "claude"


def get_provider(name: str) -> LLMProvider:
    try:
        return _PROVIDERS[name]
    except KeyError as exc:
        raise ValueError(f"unknown provider: {name!r}") from exc


def list_models(name: str) -> list[ModelOption]:
    return get_provider(name).list_models()


def _validate_model(provider_name: str, model: str) -> str:
    options = get_provider(provider_name).list_models()
    if options and all(m.id != model for m in options):
        known = ", ".join(m.id for m in options)
        raise ValueError(f"unknown model {model!r} for provider {provider_name!r} (available: {known})")
    return model


def resolve_model(provider_name: str, model: Optional[str]) -> Optional[str]:
    """Turn a requested model into one this provider will actually accept.

    Empty/None means "whatever this provider defaults to". Anything else must
    be in the provider's catalog — otherwise the CLI would fail much later,
    mid-run, with a message the user can't act on.
    """
    if not model:
        return get_provider(provider_name).default_model
    return _validate_model(provider_name, model)


def resolve_step_model(provider_name: str, model: Optional[str]) -> Optional[str]:
    """Same, for the per-step agents — falling back to the provider's own step
    default rather than to its headline model."""
    if not model:
        return get_provider(provider_name).default_step_model
    return _validate_model(provider_name, model)


async def health_report() -> dict:
    # Concurrently: two of these spawn a CLI and the third makes a network
    # round-trip, and the method picker can't render until all three land.
    # Run serially they add up to the slowest first paint in the app.
    entries = await asyncio.gather(*(p.health() for p in _PROVIDERS.values()))

    report = {}
    for (name, provider), entry in zip(_PROVIDERS.items(), entries):
        entry["label"] = provider.label
        entry["models"] = [asdict(m) for m in provider.list_models()]
        entry["default_model"] = provider.default_model
        entry["default_step_model"] = provider.default_step_model
        entry["speed_tier"] = provider.speed_tier
        entry["speed_note"] = provider.speed_note
        report[name] = entry
    return report
