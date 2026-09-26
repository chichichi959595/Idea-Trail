from __future__ import annotations

from dataclasses import asdict
from typing import Dict, Optional

from .base import LLMProvider, ModelOption
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


def list_models(name: str) -> list[ModelOption]:
    return get_provider(name).list_models()


def resolve_model(provider_name: str, model: Optional[str]) -> Optional[str]:
    """Turn a requested model into one this provider will actually accept.

    Empty/None means "whatever this provider defaults to". Anything else must
    be in the provider's catalog — otherwise the CLI would fail much later,
    mid-run, with a message the user can't act on.
    """
    provider = get_provider(provider_name)
    if not model:
        return provider.default_model

    options = provider.list_models()
    if options and all(m.id != model for m in options):
        known = ", ".join(m.id for m in options)
        raise ValueError(f"unknown model {model!r} for provider {provider_name!r} (available: {known})")
    return model


async def health_report() -> dict:
    report = {}
    for name, provider in _PROVIDERS.items():
        entry = await provider.health()
        entry["label"] = provider.label
        entry["models"] = [asdict(m) for m in provider.list_models()]
        entry["default_model"] = provider.default_model
        report[name] = entry
    return report
