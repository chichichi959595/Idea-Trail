from __future__ import annotations

import asyncio
import json
import time
from typing import Optional

from .base import LLMResult, ProviderError

_CONCURRENCY = asyncio.Semaphore(2)
_TIMEOUT_SECONDS = 180


class ClaudeCodeProvider:
    """Calls the locally-authenticated `claude` CLI in headless print mode.

    Uses whatever account is logged into Claude Code on this machine
    (Claude Pro/Max subscription quota) — never an ANTHROPIC_API_KEY.
    """

    name = "claude"

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
        ]
        if json_schema is not None:
            argv += ["--json-schema", json.dumps(json_schema)]
        # Pin a real model instead of letting the CLI auto-route — observed
        # occasional placeholder-quality output ("測試"/"A"/"B") on calls left
        # to the CLI's own routing.
        model = model or "sonnet"
        argv += ["--model", model]

        started = time.monotonic()
        async with _CONCURRENCY:
            try:
                proc = await asyncio.create_subprocess_exec(
                    *argv,
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
            cost_usd=payload.get("total_cost_usd"),
            duration_ms=duration_ms,
            raw=raw,
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
