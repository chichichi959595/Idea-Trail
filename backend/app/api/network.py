"""Where phones can reach this machine, for the host screen's QR code.

Neither address can be written down ahead of time: the LAN IP changes with the
Wi-Fi, and a free ngrok URL changes every time the tunnel restarts. So the QR
is built from whatever this returns at the moment the lobby opens.
"""

from __future__ import annotations

import json
import socket
import urllib.request

from fastapi import APIRouter

router = APIRouter(tags=["network"])

NGROK_API = "http://127.0.0.1:4040/api/tunnels"


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


@router.get("/network/join-origins")
def join_origins():
    """`lan_ip` still needs the frontend's port, which only the browser knows."""
    return {"lan_ip": _lan_ip(), "ngrok_url": _ngrok_url()}
