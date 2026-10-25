"""Where phones can reach this machine, for the host screen's QR code.

Neither address can be written down ahead of time: the LAN IP changes with the
Wi-Fi, and a free ngrok URL changes every time the tunnel restarts. So the QR
is built from whatever this returns at the moment the lobby opens.

The host can also start the tunnel from that screen instead of a terminal.
These routes are host-only like everything outside `/relay/{code}/...` (see
app/access.py) — a phone that could open or close the tunnel would be bad.
"""

from __future__ import annotations

import json
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
from typing import IO

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(tags=["network"])

NGROK_API = "http://127.0.0.1:4040/api/tunnels"

# How long a start request waits for the tunnel to come up before answering
# "starting" and leaving the rest to the lobby's poll. A normal start takes
# one or two seconds; a failed one (no authtoken) exits sooner than that.
START_WAIT_S = 8.0


def _lan_ip() -> str | None:
    # Connecting a UDP socket sends nothing; it only asks the OS which
    # interface would carry traffic to that address — i.e. the one on the Wi-Fi.
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
        except OSError:
            return None
    return None if ip.startswith("127.") else ip


def _ngrok_url() -> str | None:
    """The public URL of a running ngrok agent, read off its local API."""
    try:
        with urllib.request.urlopen(NGROK_API, timeout=0.5) as res:
            tunnels = json.load(res).get("tunnels", [])
    except (OSError, ValueError):
        return None
    https = [t["public_url"] for t in tunnels if t.get("public_url", "").startswith("https://")]
    return https[0] if https else None


# --------------------------------------------------------------------------
# the agent this backend started, if any
# --------------------------------------------------------------------------

# ngrok's own error codes for the two failures a host can fix themselves.
_ERROR_KINDS = {
    "ERR_NGROK_4018": "no_authtoken",  # installed, but never `ngrok config add-authtoken`
    "ERR_NGROK_108": "session_limit",  # free plan: an agent is already online elsewhere
}


class _Agent:
    """One ngrok process, owned by this backend and stopped along with it.

    A tunnel the host opened in their own terminal is never touched: it shows
    up as "external", and only the one started here can be stopped from here.
    """

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.proc: subprocess.Popen | None = None
        self._stderr: IO[bytes] | None = None
        self.error: dict | None = None

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def start(self, binary: str, port: int) -> None:
        self.error = None
        self._stderr = tempfile.TemporaryFile()
        # Logging to stdout keeps ngrok from drawing its terminal UI; stdout
        # goes nowhere and the one-paragraph failure summary lands on stderr.
        self.proc = subprocess.Popen(
            [binary, "http", str(port), "--log", "stdout", "--log-level", "warn"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=self._stderr,
        )

    def reap(self) -> None:
        """If the process died on its own, keep why and forget it."""
        if self.proc is None or self.proc.poll() is None:
            return
        detail = self._read_stderr()
        kind = next((k for code, k in _ERROR_KINDS.items() if code in detail), "other")
        self.error = {"kind": kind, "detail": detail or f"ngrok 結束了（代碼 {self.proc.returncode}）"}
        self._forget()

    def stop(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.error = None
        self._forget()

    def _read_stderr(self) -> str:
        if self._stderr is None:
            return ""
        self._stderr.seek(0)
        text = self._stderr.read().decode(errors="replace")
        lines = [re.sub(r"^ERROR:\s*", "", line).rstrip() for line in text.splitlines()]
        return "\n".join(lines).strip()[-1500:]

    def _forget(self) -> None:
        if self._stderr is not None:
            self._stderr.close()
        self.proc = None
        self._stderr = None


_agent = _Agent()


def stop_managed_ngrok() -> None:
    """For the app's shutdown, so a reload or Ctrl+C doesn't leave a tunnel open."""
    with _agent.lock:
        _agent.stop()


def _ngrok_status(url: str | None) -> dict:
    _agent.reap()
    managed = _agent.alive()
    if url:
        state = "running" if managed else "external"
    elif managed:
        state = "starting"
    elif shutil.which("ngrok") is None:
        state = "missing"
    elif _agent.error:
        state = "failed"
    else:
        state = "idle"
    return {"state": state, "error": _agent.error if state == "failed" else None}


def _origins() -> dict:
    url = _ngrok_url()
    return {"lan_ip": _lan_ip(), "ngrok_url": url, "ngrok": _ngrok_status(url)}


@router.get("/network/join-origins")
def join_origins():
    """`lan_ip` still needs the frontend's port, which only the browser knows."""
    return _origins()


class StartNgrokRequest(BaseModel):
    # The port the host's browser is on — the dev server's, which the backend
    # can't know (Vite moves off 5173 when it's taken).
    port: int = Field(ge=1, le=65535)


@router.post("/network/ngrok/start")
def start_ngrok(body: StartNgrokRequest):
    """Start a tunnel to the frontend and wait briefly for its URL.

    A plain `def`, so the wait runs in the threadpool rather than blocking the
    event loop.
    """
    with _agent.lock:
        _agent.reap()
        # Already up — ours or the host's own. The free plan allows a single
        # agent, so a second one would only fail.
        if _agent.alive() or _ngrok_url():
            return _origins()
        binary = shutil.which("ngrok")
        if binary is None:
            return _origins()
        _agent.start(binary, body.port)

        deadline = time.monotonic() + START_WAIT_S
        while time.monotonic() < deadline and _agent.alive() and not _ngrok_url():
            time.sleep(0.25)
    return _origins()


@router.post("/network/ngrok/stop")
def stop_ngrok():
    stop_managed_ngrok()
    return _origins()
