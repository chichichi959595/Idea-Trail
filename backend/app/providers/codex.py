from __future__ import annotations

import asyncio
import json
import tempfile
import time
import tomllib
from pathlib import Path
from typing import Optional

from .base import LLMResult, ModelOption, ProviderError

_CONCURRENCY = asyncio.Semaphore(2)
_TIMEOUT_SECONDS = 180

_CODEX_HOME = Path.home() / ".codex"
_MODELS_CACHE = _CODEX_HOME / "models_cache.json"
_CONFIG = _CODEX_HOME / "config.toml"


def _cached_models() -> list[ModelOption]:
    """Read the model list the codex CLI itself caches for this account.

    Codex offers no `models list` command, but it writes what the account may
    use to ~/.codex/models_cache.json — so the picker shows real options for
    whoever is logged in here, instead of a hardcoded list that rots.
    """
    try:
        payload = json.loads(_MODELS_CACHE.read_text())
    except (OSError, json.JSONDecodeError):
        return []

    entries = [m for m in payload.get("models", []) if isinstance(m, dict)]
    # "hide" marks internal models (auto-review and friends) that aren't meant
    # to be picked by hand.
    listed = [m for m in entries if m.get("visibility") == "list" and m.get("slug")]
    listed.sort(key=lambda m: (m.get("priority") if m.get("priority") is not None else 999))
    return [
        ModelOption(
            id=m["slug"],
            label=m.get("display_name") or m["slug"],
            description=m.get("description") or "",
        )
        for m in listed
    ]


def _configured_model() -> Optional[str]:
    """Whatever `model = ...` this machine's codex config.toml pins, if any."""
    try:
        with _CONFIG.open("rb") as fh:
            config = tomllib.load(fh)
    except (OSError, tomllib.TOMLDecodeError):
        return None
    model = config.get("model")
    return model if isinstance(model, str) and model else None


class CodexProvider:
    """Calls the locally-authenticated `codex` CLI in headless exec mode.

    Uses whatever account is logged into Codex on this machine (ChatGPT
    Plus/Pro subscription quota) — never an OPENAI_API_KEY.

    Codex exec has no dedicated system-prompt flag, so the persona text is
    prepended to the user prompt. Runs in a scratch cwd with a read-only
    sandbox since these calls are plain text generation, not coding tasks.
    """

    name = "codex"
    label = "Codex"

    @property
    def default_model(self) -> Optional[str]:
        configured = _configured_model()
        if configured:
            return configured
        models = self.list_models()
        return models[0].id if models else None

    def list_models(self) -> list[ModelOption]:
        models = _cached_models()
        # A config-pinned model that the cache doesn't list is still a valid
        # choice here — it's what plain `codex` runs — so keep it selectable.
        configured = _configured_model()
        if configured and all(m.id != configured for m in models):
            models.insert(0, ModelOption(id=configured, label=configured, description="codex 設定檔指定的模型"))
        return models

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[dict] = None,
        model: Optional[str] = None,
    ) -> LLMResult:
        combined_prompt = f"{system_prompt}\n\n{user_prompt}" if system_prompt else user_prompt
        # Resolve the default here rather than leaving it implicit, so the
        # logged LLMResult records which model actually ran.
        model = model or self.default_model

        with tempfile.TemporaryDirectory(prefix="codex-run-") as scratch_dir:
            scratch = Path(scratch_dir)
            out_path = scratch / "last-message.txt"
            argv = [
                "codex",
                "exec",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "--ephemeral",
                # This machine's config.toml points openai_base_url at a local
                # bridge (127.0.0.1:17841) that only exists while the ChatGPT
                # desktop app owns it. Override back to the normal
                # subscription-auth endpoint so headless calls don't depend
                # on that app being open.
                "-c",
                'openai_base_url="https://chatgpt.com/backend-api/codex"',
                "-C",
                str(scratch),
                "--output-last-message",
                str(out_path),
            ]
            schema_path = None
            if json_schema is not None:
                schema_path = scratch / "schema.json"
                schema_path.write_text(json.dumps(json_schema))
                argv += ["--output-schema", str(schema_path)]
            if model:
                argv += ["-m", model]
            argv.append(combined_prompt)

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
                    raise ProviderError(
                        f"codex CLI timed out after {_TIMEOUT_SECONDS}s "
                        "(if this machine routes Codex through the ChatGPT desktop "
                        "app's local bridge, make sure that app is running)"
                    ) from exc
                except FileNotFoundError as exc:
                    raise ProviderError("codex CLI not found on PATH") from exc

            duration_ms = int((time.monotonic() - started) * 1000)

            if proc.returncode != 0:
                raise ProviderError(
                    f"codex CLI exited {proc.returncode}: {stderr.decode(errors='replace').strip()[-800:]}"
                )

            if not out_path.exists():
                raise ProviderError(
                    "codex CLI finished but wrote no --output-last-message file: "
                    f"{stderr.decode(errors='replace').strip()[-800:]}"
                )

            raw = out_path.read_text(errors="replace")

        structured = None
        if json_schema is not None:
            try:
                structured = json.loads(raw)
            except json.JSONDecodeError:
                structured = None

        return LLMResult(
            text=raw,
            structured=structured,
            provider=self.name,
            model=model,
            # `codex exec` reports nothing about which model actually served
            # the request, so the requested slug is all we can record.
            resolved_model=model,
            cost_usd=None,
            duration_ms=duration_ms,
            raw=raw,
        )

    async def health(self) -> dict:
        try:
            proc = await asyncio.create_subprocess_exec(
                "codex",
                "login",
                "status",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        except (asyncio.TimeoutError, FileNotFoundError) as exc:
            return {"ok": False, "detail": str(exc)}

        text = (stdout.decode(errors="replace") + stderr.decode(errors="replace")).strip()
        ok = proc.returncode == 0 and "logged in" in text.lower()
        return {"ok": ok, "detail": text}
