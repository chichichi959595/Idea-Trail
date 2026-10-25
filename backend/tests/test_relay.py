"""多人接龍, end to end through the API: the rotation, what each phone is
allowed to see, the round clock, and who may reach which routes."""

from __future__ import annotations

import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app import relay
from app.api import relay as relay_api
from app.main import app


# --------------------------------------------------------------------------
# rotation rule
# --------------------------------------------------------------------------


@pytest.mark.parametrize("n", [3, 4, 5, 8])
def test_with_enough_people_nobody_gets_their_own_chain_back(n):
    rounds = len(relay.DEFAULT_RUNGS)
    for seat in range(n):
        held = [relay.chain_for(seat, r, n) for r in range(rounds)]
        assert len(set(held)) == rounds


def test_in_a_small_room_a_paper_comes_back_but_never_twice_running():
    rounds = len(relay.DEFAULT_RUNGS)
    for seat in range(2):
        held = [relay.chain_for(seat, r, 2) for r in range(rounds)]
        assert all(a != b for a, b in zip(held, held[1:]))


@pytest.mark.parametrize("n", [2, 3, 4, 7])
def test_every_round_every_chain_has_exactly_one_writer(n):
    for r in range(len(relay.DEFAULT_RUNGS)):
        assert sorted(relay.chain_for(s, r, n) for s in range(n)) == list(range(n))
        for c in range(n):
            assert relay.chain_for(relay.seat_for(c, r, n), r, n) == c


def test_the_ladder_starts_on_the_user_and_ends_on_the_pain():
    ladder = relay.DEFAULT_RUNGS
    assert ladder[0]["role"] == "who" and ladder[-1]["role"] == "pain"


def test_timers_grow_with_the_paper():
    timers = [rung["timer_seconds"] for rung in relay.DEFAULT_RUNGS]
    assert timers == sorted(timers) and timers[0] < timers[-1]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


@pytest.fixture
def open_run(client, session_id):
    def _open() -> dict:
        res = client.post(
            f"/sessions/{session_id}/method-runs",
            json={"method_name": "relay", "provider": "fake"},
        )
        assert res.status_code == 200, res.text
        return client.get(f"/relay-runs/{res.json()['id']}").json()

    return _open


def _join(client, code: str, name: str) -> str:
    res = client.post(f"/relay/{code}/join", json={"display_name": name})
    assert res.status_code == 200, res.text
    return res.json()["token"]


def _me(client, code: str, token: str) -> dict:
    res = client.get(f"/relay/{code}/me", headers={"X-Relay-Token": token})
    assert res.status_code == 200, res.text
    return res.json()


def _submit(client, code: str, token: str, text: str):
    cell_id = _me(client, code, token)["round"]["cell_id"]
    return client.post(
        f"/relay/{code}/cells/{cell_id}",
        json={"answer_text": text},
        headers={"X-Relay-Token": token},
    )


@pytest.fixture
def started(client, open_run):
    """A run with four phones in it, started. Returns (run, {name: token})."""
    run = open_run()
    code = run["join_code"]
    tokens = {name: _join(client, code, name) for name in ["阿明", "小華", "佳佳", "大雄"]}
    res = client.post(f"/relay-runs/{run['id']}/start")
    assert res.status_code == 200, res.text
    return res.json(), tokens


# --------------------------------------------------------------------------
# lobby
# --------------------------------------------------------------------------


def test_relay_is_a_method_and_opens_a_lobby(client, session_id):
    catalog = {m["name"]: m for m in client.get("/methods").json()}
    assert catalog["relay"]["mode"] == "relay"
    assert catalog["relay"]["step_count"] == len(relay.DEFAULT_RUNGS)
    assert all(m["mode"] == "solo" for name, m in catalog.items() if name != "relay")

    run = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "relay", "provider": "fake"},
    ).json()
    assert run["mode"] == "relay" and run["status"] == "lobby"
    assert len(run["join_code"]) == 4
    # No first step: nobody answers a relay one question at a time.
    assert run["steps"] == []
    # The provider pick is kept for the analysis that will follow the reveal.
    assert run["model"] == "fake-model"


def test_lobby_lists_joiners_in_seat_order(client, open_run):
    run = open_run()
    assert run["status"] == "lobby" and len(run["join_code"]) == 4
    for name in ["A", "B", "C"]:
        _join(client, run["join_code"], name)

    state = client.get(f"/relay-runs/{run['id']}").json()
    assert [(p["display_name"], p["seat_index"]) for p in state["participants"]] == [
        ("A", 0),
        ("B", 1),
        ("C", 2),
    ]


def test_join_code_is_case_insensitive(client, open_run):
    run = open_run()
    _join(client, run["join_code"].lower(), "A")


def test_cannot_start_alone(client, open_run):
    run = open_run()
    _join(client, run["join_code"], "A")
    res = client.post(f"/relay-runs/{run['id']}/start")
    assert res.status_code == 400


def test_the_lobby_previews_the_whole_ladder(client, open_run):
    run = open_run()
    assert len(run["rungs"]) == 3


def test_two_people_play_all_three_rounds(client, open_run):
    run = open_run()
    code = run["join_code"]
    tokens = {name: _join(client, code, name) for name in ["阿明", "小華"]}
    started = client.post(f"/relay-runs/{run['id']}/start").json()
    assert started["status"] == "writing" and started["rounds"] == 3

    for round_index in range(3):
        for name, token in tokens.items():
            assert _submit(client, code, token, f"{name}-{round_index}").status_code == 200

    state = client.get(f"/relay-runs/{run['id']}").json()
    assert state["status"] == "revealed"
    assert len(state["chains"]) == 2
    for chain in state["chains"]:
        authors = [c["author"] for c in chain["cells"]]
        # The paper went back to whoever started it for the last layer.
        assert authors[0] == authors[2] != authors[1]
        assert chain["cells"][-1]["role"] == "pain"


def test_cannot_join_after_start(client, started):
    run, _ = started
    res = client.post(f"/relay/{run['join_code']}/join", json={"display_name": "遲到"})
    assert res.status_code == 409


def test_unknown_token_is_rejected(client, started):
    run, _ = started
    res = client.get(f"/relay/{run['join_code']}/me", headers={"X-Relay-Token": "nope"})
    assert res.status_code == 401


# --------------------------------------------------------------------------
# writing
# --------------------------------------------------------------------------


def test_full_relay_reveals_every_chain(client, started):
    run, tokens = started
    code = run["join_code"]
    assert run["status"] == "writing" and run["rounds"] == 3

    for round_index in range(3):
        for name, token in tokens.items():
            res = _submit(client, code, token, f"{name}-第{round_index + 1}層")
            assert res.status_code == 200, res.text

    state = client.get(f"/relay-runs/{run['id']}").json()
    assert state["status"] == "revealed"
    assert len(state["chains"]) == 4
    for chain in state["chains"]:
        assert [c["round_index"] for c in chain["cells"]] == [0, 1, 2]
        # Three different hands on every chain.
        assert len({c["author"] for c in chain["cells"]}) == 3
        assert all(c["answer"] for c in chain["cells"])

    # Phones see the wall too, but not who wrote what.
    phone = _me(client, code, tokens["阿明"])
    assert phone["status"] == "revealed"
    assert "author" not in phone["chains"][0]["cells"][0]


def test_the_last_submission_closes_the_round(client, started):
    run, tokens = started
    code = run["join_code"]
    names = list(tokens)
    for name in names[:-1]:
        _submit(client, code, tokens[name], "x")
    assert client.get(f"/relay-runs/{run['id']}").json()["round_index"] == 0
    _submit(client, code, tokens[names[-1]], "x")
    assert client.get(f"/relay-runs/{run['id']}").json()["round_index"] == 1


def test_a_phone_only_ever_sees_its_own_paper(client, started):
    """The activity's whole point: N chains growing at once, nobody seeing the
    others. The other chains must be absent from the response, not hidden."""
    run, tokens = started
    code = run["join_code"]
    for name, token in tokens.items():
        _submit(client, code, token, f"寫在第一層的{name}")

    for name, token in tokens.items():
        me = _me(client, code, token)
        paper = me["round"]["paper"]
        assert len(paper) == 1
        # It's someone else's first layer, never this phone's own.
        assert paper[0]["answer"] != f"寫在第一層的{name}"
        body = str(me)
        for other in tokens:
            text = f"寫在第一層的{other}"
            if text != paper[0]["answer"]:
                assert text not in body


def test_a_second_submit_is_rejected(client, started):
    run, tokens = started
    token = tokens["阿明"]
    cell_id = _me(client, run["join_code"], token)["round"]["cell_id"]
    url = f"/relay/{run['join_code']}/cells/{cell_id}"
    headers = {"X-Relay-Token": token}
    assert client.post(url, json={"answer_text": "a"}, headers=headers).status_code == 200
    assert client.post(url, json={"answer_text": "b"}, headers=headers).status_code == 409


def test_cannot_write_on_someone_elses_cell(client, started):
    run, tokens = started
    theirs = _me(client, run["join_code"], tokens["小華"])["round"]["cell_id"]
    res = client.post(
        f"/relay/{run['join_code']}/cells/{theirs}",
        json={"answer_text": "偷寫"},
        headers={"X-Relay-Token": tokens["阿明"]},
    )
    assert res.status_code == 403


def test_round_closes_on_the_clock_and_leaves_a_gap(client, started, monkeypatch):
    run, tokens = started
    code = run["join_code"]
    _submit(client, code, tokens["阿明"], "只有我交了")
    sleepy_cell = _me(client, code, tokens["小華"])["round"]["cell_id"]

    later = dt.datetime.now(dt.timezone.utc) + dt.timedelta(
        seconds=relay.DEFAULT_RUNGS[0]["timer_seconds"] + relay.SUBMIT_GRACE_SECONDS + 1
    )
    monkeypatch.setattr(relay_api, "_now", lambda: later)

    state = client.get(f"/relay-runs/{run['id']}").json()
    assert state["round_index"] == 1
    # A phone that slept through the deadline is told the round is over.
    res = client.post(
        f"/relay/{code}/cells/{sleepy_cell}",
        json={"answer_text": "太晚了"},
        headers={"X-Relay-Token": tokens["小華"]},
    )
    assert res.status_code == 409

    gaps = [
        p["answer"]
        for t in tokens.values()
        for p in _me(client, code, t)["round"]["paper"]
    ]
    assert gaps.count(None) == 3 and "只有我交了" in gaps


def test_host_can_close_a_round_early(client, started):
    run, _ = started
    res = client.post(f"/relay-runs/{run['id']}/advance")
    assert res.json()["round_index"] == 1
    client.post(f"/relay-runs/{run['id']}/advance")
    assert client.post(f"/relay-runs/{run['id']}/advance").json()["status"] == "revealed"


def test_flag_any_layer_on_your_own_paper_but_nothing_else(client, started):
    run, tokens = started
    code = run["join_code"]
    for t in tokens.values():
        _submit(client, code, t, "x")
    for t in tokens.values():
        _submit(client, code, t, "y")

    me = _me(client, code, tokens["阿明"])
    first, second = me["round"]["paper"]
    res = client.post(
        f"/relay/{code}/cells/{first['cell_id']}/flag",
        json={"flagged": True},
        headers={"X-Relay-Token": tokens["阿明"]},
    )
    assert res.status_code == 200
    assert res.json()["round"]["paper"][0]["flagged_unclear"] is True

    # A cell from a chain that isn't in your hands is "not found", not "forbidden".
    elsewhere = _me(client, code, tokens["小華"])["round"]["paper"][0]["cell_id"]
    res = client.post(
        f"/relay/{code}/cells/{elsewhere}/flag",
        json={"flagged": True},
        headers={"X-Relay-Token": tokens["阿明"]},
    )
    assert res.status_code == 404


def test_a_relay_run_cannot_be_answered_like_a_solo_run(client, started):
    run, _ = started
    res = client.post(
        f"/method-runs/{run['id']}/answer", json={"step_index": 0, "answer": "x"}
    )
    assert res.status_code == 400


# --------------------------------------------------------------------------
# who can reach what
# --------------------------------------------------------------------------


# --------------------------------------------------------------------------
# into the pain point library
# --------------------------------------------------------------------------


def _play_two(client, open_run, answers: dict[str, list[str]]) -> dict:
    """Two phones, every round answered from `answers[name]`; returns the
    revealed host state."""
    run = open_run()
    code = run["join_code"]
    tokens = {name: _join(client, code, name) for name in answers}
    client.post(f"/relay-runs/{run['id']}/start")
    for round_index in range(3):
        for name, token in tokens.items():
            assert _submit(client, code, token, answers[name][round_index]).status_code == 200
    return client.get(f"/relay-runs/{run['id']}").json()


def test_a_chain_is_saved_as_a_pain_point_in_the_rooms_own_words(client, open_run):
    state = _play_two(
        client,
        open_run,
        {"阿明": ["夜班護理師", "半夜交班", "交班單寫不完"], "小華": ["里幹事", "颱風前一天", ""]},
    )
    chain = state["chains"][0]
    assert chain["pain_point_id"] is None
    res = client.post(f"/relay-runs/{state['id']}/chains/0/pain-point")
    assert res.status_code == 200, res.text
    pain = res.json()
    # Chain 0 started with 阿明, went to 小華, and came back to 阿明.
    assert pain["who"] == "夜班護理師"
    assert pain["context"] == "颱風前一天"
    assert pain["statement"] == "交班單寫不完"
    assert pain["source"] == "discovery" and pain["method_run_id"] == state["id"]

    # Saved once: the wall says so, and saving again hands back the same one.
    state = client.get(f"/relay-runs/{state['id']}").json()
    assert state["chains"][0]["pain_point_id"] == pain["id"]
    again = client.post(f"/relay-runs/{state['id']}/chains/0/pain-point").json()
    assert again["id"] == pain["id"]
    assert [p["id"] for p in client.get("/pain-points").json()].count(pain["id"]) == 1


def test_a_chain_with_no_pain_written_cannot_be_saved(client, open_run):
    state = _play_two(client, open_run, {"阿明": ["a", "b", "c"], "小華": ["d", "e", ""]})
    # Chain 1's last layer is 小華's empty one.
    assert client.post(f"/relay-runs/{state['id']}/chains/1/pain-point").status_code == 400
    assert client.post(f"/relay-runs/{state['id']}/chains/5/pain-point").status_code == 404


def test_nothing_is_saved_before_the_reveal(client, started):
    run, _ = started
    assert client.post(f"/relay-runs/{run['id']}/chains/0/pain-point").status_code == 409


@pytest.fixture
def phone(client):
    """A client that looks like a phone on the Wi-Fi. Shares the app — and so
    the test database override — with `client`."""
    with TestClient(app, client=("192.168.1.23", 50123)) as c:
        yield c


def test_phones_reach_participant_routes_only(client, phone, open_run, session_id):
    run = open_run()
    res = phone.post(f"/relay/{run['join_code']}/join", json={"display_name": "手機"})
    assert res.status_code == 200

    for method, path in [
        ("get", f"/relay-runs/{run['id']}"),
        ("post", f"/relay-runs/{run['id']}/start"),
        ("post", f"/relay-runs/{run['id']}/chains/0/pain-point"),
        ("get", f"/sessions/{session_id}/ideas"),
        ("post", "/sessions"),
        ("get", "/providers/health"),
        ("get", "/network/join-origins"),
        ("post", "/network/ngrok/start"),
        ("post", "/network/ngrok/stop"),
    ]:
        assert getattr(phone, method)(path).status_code == 403, path


def test_forwarded_requests_are_judged_by_every_hop(client):
    # Through Vite's proxy from the host's own browser: loopback all the way.
    assert client.get("/methods", headers={"X-Forwarded-For": "::1"}).status_code == 200
    # Through ngrok: the socket is loopback, the client was not.
    res = client.get("/methods", headers={"X-Forwarded-For": "203.0.113.9, 127.0.0.1"})
    assert res.status_code == 403
    # A forged loopback hop doesn't help — the real one is appended after it.
    res = client.get("/methods", headers={"X-Forwarded-For": "127.0.0.1, 192.168.1.23"})
    assert res.status_code == 403
