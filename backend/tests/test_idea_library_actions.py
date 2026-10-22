"""想法庫's own actions: delete, and merge / converge across sessions.

The idea wall used to be the only place these happened, and it only ever held
one session's ideas. 想法庫 spans sessions, so these can't assume that.
"""

from __future__ import annotations


def _other_session(client) -> int:
    res = client.post("/sessions", json={"team_size": 2, "has_clear_problem": False})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_delete_idea_takes_its_links_and_convergence_with_it(
    client, session_id, start_run, answer_all, provider
):
    ideas = answer_all(start_run())["ideas"]
    gone, kept = ideas[0]["id"], ideas[1]["id"]
    provider.step_output = {"links": [{"a": gone, "b": kept, "reason": "同一個痛點"}]}
    assert client.post("/idea-links/analyze", json={"provider": "fake"}).status_code == 200
    client.post("/convergence-projects", json={"idea_id": gone, "session_id": session_id})

    res = client.delete(f"/ideas/{gone}")
    assert res.status_code == 200, res.text
    assert [i["id"] for i in client.get("/ideas").json()] == [kept]
    assert client.get("/idea-links").json() == []
    assert client.get("/convergence-projects").json() == []


def test_delete_unknown_idea_is_404(client):
    assert client.delete("/ideas/999").status_code == 404


def test_merge_can_take_ideas_from_another_session(
    client, session_id, start_run, answer_all, provider
):
    mine = answer_all(start_run())["ideas"][0]["id"]
    theirs_session = _other_session(client)
    theirs = answer_all(
        client.post(
            f"/sessions/{theirs_session}/method-runs",
            json={"method_name": "pain_point", "provider": "fake"},
        ).json()
    )["ideas"][0]["id"]

    provider.step_output = {"ideas": [{"title": "合併", "description": "兩場的想法合起來"}]}
    res = client.post(
        f"/sessions/{session_id}/synthesize",
        json={"idea_ids": [mine, theirs], "provider": "fake"},
    )
    assert res.status_code == 200, res.text
    assert all(i["session_id"] == session_id for i in res.json())


def test_converge_accepts_an_idea_from_another_session(
    client, session_id, start_run, answer_all
):
    idea_id = answer_all(start_run())["ideas"][0]["id"]
    elsewhere = _other_session(client)

    res = client.post("/convergence-projects", json={"idea_id": idea_id, "session_id": elsewhere})
    assert res.status_code == 200, res.text
    assert res.json()["idea_id"] == idea_id
    assert res.json()["session_id"] == elsewhere
