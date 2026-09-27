from __future__ import annotations

import asyncio
import json
import time
from typing import Optional

from .base import LLMResult, ModelOption, ProviderError

_CONCURRENCY = asyncio.Semaphore(2)
_TIMEOUT_SECONDS = 180

# The claude CLI has no machine-readable model list, so this is a hand-kept
# catalog of the aliases it accepts ("an alias for the latest model").
# Aliases rather than pinned ids on purpose: they keep pointing at the newest
# model in each tier without this file needing an edit every release.
_MODELS = [
    ModelOption("sonnet", "Sonnet", "速度與品質的平衡點，這裡的預設值"),
    ModelOption("opus", "Opus", "推理最強、也最慢最吃額度，適合最後收斂"),
    ModelOption("haiku", "Haiku", "最快最省，適合步驟多的方法"),
    ModelOption("fable", "Fable", "寫作導向，文字描述較有畫面"),
]
_DEFAULT_MODEL = "sonnet"


def _usage_figures(payload: dict) -> dict:
    """Token counts out of the CLI's own usage report.

    `input_tokens` on its own is misleading here: almost all of the input is
    served from cache, so the field reads as a handful of tokens while the model
    is really being sent thousands. Summing the three is what compares to the
    prompt that was actually sent.
    """
    usage = payload.get("usage") or {}
    details = usage.get("output_tokens_details") or {}
    fresh = usage.get("input_tokens") or 0
    cached_read = usage.get("cache_read_input_tokens") or 0
    cached_write = usage.get("cache_creation_input_tokens") or 0
    return {
        "input_tokens": fresh + cached_read + cached_write or None,
        "output_tokens": usage.get("output_tokens"),
        "thinking_tokens": details.get("thinking_tokens"),
        "api_duration_ms": payload.get("duration_api_ms"),
    }


def _model_actually_used(model_usage: Optional[dict], requested: str) -> str:
    """Which model really produced the answer, per the CLI's own usage report.

    `modelUsage` is not just the model we asked for: Claude Code bills its own
    internal side-calls (a haiku classifier, for instance) into the same dict,
    so the first key is often the wrong answer. Trust the entry that matches
    the requested alias, and otherwise the one that actually wrote the output.
    """
    if not model_usage:
        return requested

    for name, usage in model_usage.items():
        canonical = (usage or {}).get("canonicalModel") or name
        # Either direction: "sonnet" matches "claude-sonnet-5", and a fully
        # dated id like "claude-haiku-4-5-20251001" matches the shorter
        # canonical "claude-haiku-4-5" it reports.
        if requested in canonical or canonical in requested:
            return name

    return max(
        model_usage.items(),
        key=lambda kv: (kv[1] or {}).get("outputTokens", 0),
    )[0]


class ClaudeCodeProvider:
    """Calls the locally-authenticated `claude` CLI in headless print mode.

    Uses whatever account is logged into Claude Code on this machine
    (Claude Pro/Max subscription quota) — never an ANTHROPIC_API_KEY.
    """

    name = "claude"
    label = "Claude Code"
    speed_tier = "slow"
    speed_note = (
        "走本機 claude CLI，一次呼叫通常 10~60 秒："
        "CLI 是 agent harness，會自己加上系統提示與內部迭代，"
        "為了一段短答案產生數千個 token。思考品質不輸 API，就是慢。"
    )

    @property
    def default_model(self) -> str:
        return _DEFAULT_MODEL

    @property
    def default_step_model(self) -> str:
        # Deliberately the same model. Stepping down to haiku is the obvious
        # move and it measured *slower* through this CLI, not faster — the
        # harness overhead dominates and does not shrink with the model. The
        # picker still lets a run override this per role.
        return _DEFAULT_MODEL

    def list_models(self) -> list[ModelOption]:
        return list(_MODELS)

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[dict] = None,
        model: Optional[str] = None,
    ) -> LLMResult:
        argv = [
            "claude",
            "-p",
            user_prompt,
            "--system-prompt",
            system_prompt,
            "--output-format",
            "json",
            "--tools",
            "",
            "--no-session-persistence",
            # No tools are in play, so booting this machine's MCP servers only
            # costs startup time (~2s per call).
            "--strict-mcp-config",
        ]
        if json_schema is not None:
            argv += ["--json-schema", json.dumps(json_schema)]
        # Pin a real model instead of letting the CLI auto-route — observed
        # occasional placeholder-quality output ("測試"/"A"/"B") on calls left
        # to the CLI's own routing.
        model = model or _DEFAULT_MODEL
        argv += ["--model", model]

        started = time.monotonic()
        async with _CONCURRENCY:
            try:
                proc = await asyncio.create_subprocess_exec(
                    *argv,
                    # Without this the CLI blocks ~3s per call waiting for
                    # stdin it is never given ("no stdin data received in 3s").
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=_TIMEOUT_SECONDS
                )
            except asyncio.TimeoutError as exc:
                proc.kill()
                raise ProviderError(f"claude CLI timed out after {_TIMEOUT_SECONDS}s") from exc
            except FileNotFoundError as exc:
                raise ProviderError("claude CLI not found on PATH") from exc

        if proc.returncode != 0:
            raise ProviderError(
                f"claude CLI exited {proc.returncode}: {stderr.decode(errors='replace').strip()}"
            )

        raw = stdout.decode(errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ProviderError(f"claude CLI returned non-JSON output: {raw[:300]}") from exc

        if payload.get("is_error"):
            raise ProviderError(f"claude CLI reported an error: {raw[:500]}")

        structured = payload.get("structured_output")
        text = payload.get("result", "")
        duration_ms = payload.get("duration_ms") or int((time.monotonic() - started) * 1000)

        return LLMResult(
            text=text,
            structured=structured,
            provider=self.name,
            model=model,
            resolved_model=_model_actually_used(payload.get("modelUsage"), model),
            cost_usd=payload.get("total_cost_usd"),
            duration_ms=duration_ms,
            raw=raw,
            **_usage_figures(payload),
        )

    async def health(self) -> dict:
        try:
            proc = await asyncio.create_subprocess_exec(
                "claude",
                "auth",
                "status",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        except (asyncio.TimeoutError, FileNotFoundError) as exc:
            return {"ok": False, "detail": str(exc)}

        if proc.returncode != 0:
            return {"ok": False, "detail": stderr.decode(errors="replace").strip()}

        try:
            status = json.loads(stdout.decode(errors="replace"))
        except json.JSONDecodeError:
            return {"ok": False, "detail": "could not parse `claude auth status` output"}

        return {
            "ok": bool(status.get("loggedIn")),
            "authMethod": status.get("authMethod"),
            "subscriptionType": status.get("subscriptionType"),
            "email": status.get("email"),
        }
