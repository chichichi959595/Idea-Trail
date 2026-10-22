"""Who is allowed to reach what, once phones are on the network.

多人接龍 needs phones to reach this app — over the LAN, or through an ngrok
tunnel that puts it on the public internet. Everything else in the app has no
auth at all: any request can start a run, read every session, or spend the
host's Claude / Codex quota. That was fine while the only client was the
host's own browser on localhost, and it stops being fine the moment a tunnel
is up.

So a request from anywhere but this machine may only reach the participant
routes (`/relay/{code}/...`), which are themselves scoped to one paper by the
caller's token. Everything else answers 403.

"From this machine" is decided by the whole forwarding chain, not by the
socket alone. The frontend reaches the backend through Vite's proxy, so the
socket is always loopback; Vite (with `xfwd`) and ngrok both *append* the
address they received the request from to X-Forwarded-For. A phone that sends
a forged `X-Forwarded-For: 127.0.0.1` still gets its real address appended
after it, so requiring every hop to be loopback can't be talked around.
"""

from __future__ import annotations

import ipaddress
import re

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

PARTICIPANT_PATH = re.compile(r"^/relay/[^/]+(/.*)?$")


def _is_loopback(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr.strip().strip("[]"))
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_loopback


def is_local_request(request: Request) -> bool:
    if request.client is None or not _is_loopback(request.client.host):
        return False
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and not all(_is_loopback(hop) for hop in forwarded.split(",")):
        return False
    return True


class LocalOnlyExceptParticipants:
    """Pure ASGI rather than BaseHTTPMiddleware, which would buffer the SSE
    endpoints' streamed responses."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            request = Request(scope)
            if not PARTICIPANT_PATH.match(request.url.path) and not is_local_request(request):
                response = JSONResponse(
                    {"detail": "只有主持人的電腦能使用這個功能"}, status_code=403
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
