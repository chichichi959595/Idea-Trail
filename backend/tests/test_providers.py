"""Provider-level unit tests: the bits that turn a CLI/API payload into an
LLMResult, and the retry gate in front of them.

These are the fields the call log needs to answer "why was that slow", so
getting them wrong is silent — the app keeps working and the log just stops
being able to explain anything.
"""

from __future__ import annotations

import asyncio

import pytest

from app.providers.claude_code import _model_actually_used, _usage_figures
from app.providers.quality import complete_with_quality_guard, looks_degenerate


# --------------------------------------------------------------------------
# usage figures out of the claude CLI payload
# --------------------------------------------------------------------------


def test_input_tokens_counts_cache_reads_not_just_fresh_tokens():
    """`input_tokens` alone reads as a handful of tokens because nearly all of
    the input is served from cache — the sum is what compares to the prompt
    that was really sent."""
    figures = _usage_figures(
        {
            "duration_api_ms": 201844,
            "usage": {
                "input_tokens": 10,
                "cache_creation_input_tokens": 12025,
                "cache_read_input_tokens": 32379,
                "output_tokens": 15471,
                "output_tokens_details": {"thinking_tokens": 4018},
            },
        }
    )
    assert figures["input_tokens"] == 44414
    assert figures["output_tokens"] == 15471
    assert figures["thinking_tokens"] == 4018
    assert figures["api_duration_ms"] == 201844


def test_usage_figures_are_none_when_the_payload_says_nothing():
    """None has to mean "no figure", never zero — a zero would read as a call
    that generated nothing."""
    assert _usage_figures({}) == {
        "input_tokens": None,
        "output_tokens": None,
        "thinking_tokens": None,
        "api_duration_ms": None,
    }


# --------------------------------------------------------------------------
# which model actually answered
# --------------------------------------------------------------------------


def test_resolved_model_ignores_the_cli_s_own_side_calls():
    """modelUsage also carries Claude Code's internal haiku classifier, so the
    first key is routinely the wrong answer."""
    model_usage = {
        "claude-haiku-4-5-20251001": {"canonicalModel": "claude-haiku-4-5", "outputTokens": 17},
        "claude-sonnet-5": {"canonicalModel": "claude-sonnet-5", "outputTokens": 15471},
    }
    assert _model_actually_used(model_usage, "sonnet") == "claude-sonnet-5"


def test_resolved_model_matches_a_fully_dated_request_against_a_short_canonical():
    """`requested in canonical` only works while the requested name is the
    shorter of the two; a dated id is longer than the canonical it reports."""
    model_usage = {
        "claude-haiku-4-5-20251001": {"canonicalModel": "claude-haiku-4-5", "outputTokens": 400},
    }
    resolved = _model_actually_used(model_usage, "claude-haiku-4-5-20251001")
    assert resolved == "claude-haiku-4-5-20251001"


def test_resolved_model_falls_back_to_the_requested_alias():
    assert _model_actually_used(None, "sonnet") == "sonnet"


def test_resolved_model_picks_whoever_wrote_the_output_when_nothing_matches():
    model_usage = {
        "claude-haiku-4-5": {"canonicalModel": "claude-haiku-4-5", "outputTokens": 12},
        "claude-opus-5": {"canonicalModel": "claude-opus-5", "outputTokens": 3000},
    }
    assert _model_actually_used(model_usage, "something-else") == "claude-opus-5"


# --------------------------------------------------------------------------
# the retry gate
# --------------------------------------------------------------------------


@pytest.mark.parametrize("structured", [None, {}])
def test_missing_structured_output_is_degenerate(structured):
    assert looks_degenerate(structured) is True


@pytest.mark.parametrize(
    "structured",
    [
        {"is_relevant": False, "clarification": "再具體一點", "analysis": "", "idea_fragments": []},
        {"ideas": [{"title": "A", "description": "B"}]},
    ],
)
def test_short_strings_are_no_longer_treated_as_placeholder_filler(structured):
    """The old length check fired on 1 of 121 logged calls while every false
    positive silently doubled the latency of the slowest thing in the app."""
    assert looks_degenerate(structured) is False


class _StubProvider:
    """Returns `outputs` one per call, so a test can make the first attempt
    unusable and the second one fine."""

    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = 0

    async def complete(self, **kwargs):
        from app.providers.base import LLMResult

        structured = self.outputs[self.calls]
        self.calls += 1
        return LLMResult(
            text="",
            structured=structured,
            provider="stub",
            model="stub-model",
            cost_usd=None,
            duration_ms=1000,
            raw="",
        )


# asyncio.run rather than an async test: this project has no async pytest
# plugin installed, and an un-awaited `async def test_...` is collected, never
# run, and reported as a pass.
def _guard(provider, **kwargs):
    return asyncio.run(
        complete_with_quality_guard(provider, system_prompt="s", user_prompt="u", **kwargs)
    )


def test_a_retried_call_reports_the_time_both_attempts_took():
    """Only the retry reaches llm_calls, so if the first attempt's time is
    dropped the log shows one inexplicably slow call instead of two."""
    provider = _StubProvider([None, {"ideas": [{"title": "x", "description": "y"}]}])
    result = _guard(provider, json_schema={"type": "object"})
    assert provider.calls == 2
    assert result.duration_ms == 2000


def test_a_usable_first_answer_is_not_retried():
    provider = _StubProvider([{"ideas": [{"title": "x", "description": "y"}]}])
    _guard(provider, json_schema={"type": "object"})
    assert provider.calls == 1


def test_calls_without_a_schema_are_never_retried():
    """Nothing to validate against, so an empty structured field means nothing."""
    provider = _StubProvider([None])
    _guard(provider)
    assert provider.calls == 1
