"""Starting and stopping ngrok from the host screen.

A stand-in `ngrok` script on PATH plays the agent, so the real process
handling runs — only the agent's local API (`_ngrok_url`) is faked.
"""

from __future__ import annotations

import pytest

from app.api import network


@pytest.fixture
def fake_ngrok(tmp_path, monkeypatch):
    """`fake_ngrok(script)` puts an executable `ngrok` with that body on PATH."""
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setattr(network, "START_WAIT_S", 3.0)
    url = {"value": None}
    monkeypatch.setattr(network, "_ngrok_url", lambda: url["value"])

    def _install(script: str) -> dict:
        binary = tmp_path / "ngrok"
        binary.write_text("#!/bin/sh\n" + script)
        binary.chmod(0o755)
        return url

    yield _install
    network.stop_managed_ngrok()


def test_missing_when_ngrok_is_not_installed(client, fake_ngrok):
    res = client.post("/network/ngrok/start", json={"port": 5173})
    assert res.json()["ngrok"] == {"state": "missing", "error": None}


def test_no_authtoken_is_told_apart(client, fake_ngrok):
    fake_ngrok('echo "ERROR:  authentication failed" >&2\necho "ERROR:  ERR_NGROK_4018" >&2\nexit 1\n')
    status = client.post("/network/ngrok/start", json={"port": 5173}).json()["ngrok"]
    assert status["state"] == "failed"
    assert status["error"]["kind"] == "no_authtoken"
    assert "ERROR:" not in status["error"]["detail"]
    # Still reported on the next poll, until another start or a stop.
    assert client.get("/network/join-origins").json()["ngrok"]["state"] == "failed"


def test_start_waits_for_the_url_and_stop_ends_it(client, fake_ngrok, monkeypatch):
    fake_ngrok("exec /bin/sleep 30\n")
    # The tunnel "comes up" once the agent is running.
    monkeypatch.setattr(
        network, "_ngrok_url", lambda: "https://abc.ngrok-free.app" if network._agent.alive() else None
    )
    body = client.post("/network/ngrok/start", json={"port": 5199}).json()
    assert body["ngrok_url"] == "https://abc.ngrok-free.app"
    assert body["ngrok"]["state"] == "running"
    proc = network._agent.proc
    assert proc.args[1:3] == ["http", "5199"]
    assert client.post("/network/ngrok/stop").json()["ngrok"]["state"] == "idle"
    assert proc.poll() is not None


def test_a_tunnel_from_the_terminal_is_left_alone(client, fake_ngrok, tmp_path):
    url = fake_ngrok(f"/usr/bin/touch {tmp_path}/started\nexec /bin/sleep 30\n")
    url["value"] = "https://mine.ngrok-free.app"
    body = client.post("/network/ngrok/start", json={"port": 5173}).json()
    assert body["ngrok"]["state"] == "external"
    assert not (tmp_path / "started").exists()


def test_port_is_validated(client):
    assert client.post("/network/ngrok/start", json={"port": 0}).status_code == 422
