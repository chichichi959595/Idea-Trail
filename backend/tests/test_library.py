"""The pain point library, the 痛點發想 stage that fills it, and the idea
library that spans sessions."""

from __future__ import annotations

DISCOVERY_OUTPUT = {
    "pain_points": [
        {
            "statement": "學生午餐尖峰排隊要等十五分鐘",
            "who": "住校的大學生",
            "context": "中午 12 點下課後",
            "current_workaround": "",
        },
        {"statement": "   ", "who": "", "context": "", "current_workaround": ""},
    ]
}


def _setup_pain_point(client, session_id) -> dict:
    rows = [p for p in client.get("/pain-points").json() if p["source"] == "setup"]
    assert len(rows) == 1
    return rows[0]


# --------------------------------------------------------------------------
# the setup screen's problem lands in the library
# --------------------------------------------------------------------------


def test_setup_problem_becomes_a_pain_point(client, session_id):
    session = client.get(f"/sessions/{session_id}").json()
    pain_point = _setup_pain_point(client, session_id)
    assert pain_point["statement"] == "排隊買午餐很浪費時間"
    assert pain_point["session_id"] == session_id
    assert session["id"] == session_id


def test_setup_pain_point_follows_the_form_until_used(client, session_id, start_run):
    body = {"has_clear_problem": True, "clear_problem_text": "宿舍洗衣機永遠被佔"}
    res = client.put(f"/sessions/{session_id}", json=body).json()
    first = _setup_pain_point(client, session_id)
    assert first["statement"] == "宿舍洗衣機永遠被佔"
    assert res["setup_pain_point_id"] == first["id"]

    # Once a run is built on it, an edit can't rewrite that run's history.
    client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "crazy_8s", "provider": "fake", "pain_point_id": first["id"]},
    )
    body["clear_problem_text"] = "宿舍烘衣機也永遠被佔"
    res = client.put(f"/sessions/{session_id}", json=body).json()
    statements = {p["statement"] for p in client.get("/pain-points").json()}
    assert statements == {"宿舍洗衣機永遠被佔", "宿舍烘衣機也永遠被佔"}
    assert res["setup_pain_point_id"] != first["id"]


def test_clearing_an_unused_setup_problem_removes_it(client, session_id):
    res = client.put(f"/sessions/{session_id}", json={"has_clear_problem": False}).json()
    assert res["setup_pain_point_id"] is None
    assert client.get("/pain-points").json() == []


# --------------------------------------------------------------------------
# 痛點發想
# --------------------------------------------------------------------------


def test_discovery_run_fills_the_library_not_the_wall(
    client, session_id, provider, start_run, answer_all
):
    provider.finalize_output = DISCOVERY_OUTPUT
    payload = answer_all(start_run("pain_discovery"))

    assert payload["method_run"]["status"] == "done"
    assert payload["ideas"] is None
    # The blank statement is dropped; "" fields are stored as unknown.
    [found] = payload["pain_points"]
    assert found["statement"] == "學生午餐尖峰排隊要等十五分鐘"
    assert found["source"] == "discovery"
    assert found["method_run_id"] == payload["method_run"]["id"]
    assert found["current_workaround"] is None

    assert client.get(f"/sessions/{session_id}/ideas").json() == []
    assert found["id"] in {p["id"] for p in client.get("/pain-points").json()}


def test_discovery_that_finds_nothing_is_retryable(
    client, session_id, provider, start_run, answer_all
):
    provider.finalize_output = {"pain_points": []}
    payload = answer_all(start_run("pain_discovery"))
    assert payload["method_run"]["status"] == "failed"

    provider.finalize_output = DISCOVERY_OUTPUT
    res = client.post(f"/method-runs/{payload['method_run']['id']}/finalize")
    assert res.json()["method_run"]["status"] == "done"
    assert len(res.json()["pain_points"]) == 1


def test_discovery_is_not_a_recommendable_method(client):
    methods = client.get("/methods").json()
    discovery = [m for m in methods if m["name"] == "pain_discovery"]
    assert discovery and discovery[0]["stage"] == "discovery"
    assert discovery[0]["label"] == "回想問題"


def test_discovery_recommendation_draws_only_on_discovery_methods(client, session_id, provider):
    # The model even names an ideation method; it is dropped, and the list is
    # as long as the discovery catalog allows rather than a padded three.
    provider.step_output = {
        "adjustment": "只有一個方法。",
        "items": [
            {"method": "scamper", "rationale": "不該出現"},
            {"method": "pain_discovery", "rationale": "從日常片段回想最適合。"},
        ],
    }
    res = client.post(
        f"/sessions/{session_id}/method-recommendation",
        params={"provider": "fake", "stage": "discovery"},
    )
    assert res.status_code == 200, res.text
    recs = res.json()["recommendations"]
    assert [r["method"] for r in recs] == ["pain_discovery"]
    assert recs[0]["rationale"] == "從日常片段回想最適合。"
    assert res.json()["rule_ranking"] == []
    assert "痛點發想" in provider.calls[-1]["system_prompt"]
    assert "scamper" not in provider.calls[-1]["user_prompt"]


def test_unknown_recommendation_stage_is_rejected(client, session_id, provider):
    res = client.post(
        f"/sessions/{session_id}/method-recommendation",
        params={"provider": "fake", "stage": "nope"},
    )
    assert res.status_code == 400
    assert provider.calls == []


# --------------------------------------------------------------------------
# 專案發想 works on a pain point
# --------------------------------------------------------------------------


def test_ideation_run_carries_its_pain_point_into_prompts_and_ideas(
    client, session_id, provider, answer_all
):
    pain_point = client.post(
        "/pain-points", json={"statement": "社團收會費要一個一個追", "who": "社團幹部"}
    ).json()
    run = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "pain_point", "provider": "fake", "pain_point_id": pain_point["id"]},
    ).json()
    assert run["pain_point_id"] == pain_point["id"]

    payload = answer_all(run)
    assert all(i["pain_point_id"] == pain_point["id"] for i in payload["ideas"])
    assert all("社團收會費要一個一個追" in c["user_prompt"] for c in provider.calls)

    listed = {p["id"]: p for p in client.get("/pain-points").json()}
    assert listed[pain_point["id"]]["idea_count"] == 2


def test_unknown_pain_point_is_rejected(client, session_id):
    res = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "pain_point", "provider": "fake", "pain_point_id": 999},
    )
    assert res.status_code == 404


def test_recommendation_reads_the_pain_point(client, session_id, provider):
    pain_point = client.post("/pain-points", json={"statement": "實驗室器材借用要填紙本"}).json()
    res = client.post(
        f"/sessions/{session_id}/method-recommendation",
        params={"provider": "fake", "pain_point_id": pain_point["id"]},
    )
    assert res.status_code == 200, res.text
    assert "實驗室器材借用要填紙本" in provider.calls[-1]["user_prompt"]


def test_merge_keeps_a_pain_point_only_when_parents_share_it(
    client, session_id, provider, answer_all
):
    pain_point = client.post("/pain-points", json={"statement": "停車位很難找"}).json()
    run = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "pain_point", "provider": "fake", "pain_point_id": pain_point["id"]},
    ).json()
    ids = [i["id"] for i in answer_all(run)["ideas"]]

    provider.step_output = {"ideas": [{"title": "合併", "description": "合併後的想法"}]}
    merged = client.post(
        f"/sessions/{session_id}/synthesize", json={"idea_ids": ids, "provider": "fake"}
    ).json()
    assert merged[0]["pain_point_id"] == pain_point["id"]


# --------------------------------------------------------------------------
# library CRUD
# --------------------------------------------------------------------------


def test_pain_point_crud(client):
    created = client.post(
        "/pain-points", json={"statement": "  報帳流程太久  ", "who": "  "}
    ).json()
    assert created["statement"] == "報帳流程太久"
    assert created["who"] is None
    assert created["source"] == "manual"

    updated = client.put(
        f"/pain-points/{created['id']}", json={"statement": "報帳要等三週", "who": "助教"}
    ).json()
    assert (updated["statement"], updated["who"]) == ("報帳要等三週", "助教")

    assert client.post("/pain-points", json={"statement": " "}).status_code == 400
    assert client.delete(f"/pain-points/{created['id']}").json() == {"deleted": True}
    assert client.get("/pain-points").json() == []


def test_deleting_a_pain_point_keeps_its_ideas(client, session_id, answer_all):
    pain_point = client.post("/pain-points", json={"statement": "找不到讀書室空位"}).json()
    run = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "pain_point", "provider": "fake", "pain_point_id": pain_point["id"]},
    ).json()
    answer_all(run)

    client.delete(f"/pain-points/{pain_point['id']}")
    ideas = client.get("/ideas").json()
    assert len(ideas) == 2
    assert all(i["pain_point_id"] is None for i in ideas)


def test_idea_size_is_set_by_the_user(client, session_id, start_run, answer_all):
    answer_all(start_run())
    idea = client.get("/ideas").json()[0]
    assert idea["size"] is None

    assert client.patch(f"/ideas/{idea['id']}", json={"size": "l"}).json()["size"] == "l"
    assert client.patch(f"/ideas/{idea['id']}", json={"size": None}).json()["size"] is None
    assert client.patch(f"/ideas/{idea['id']}", json={"size": "xl"}).status_code == 422


# --------------------------------------------------------------------------
# AI-judged links
# --------------------------------------------------------------------------


def test_link_analysis_cleans_and_replaces_links(client, session_id, provider, start_run, answer_all):
    answer_all(start_run())
    a, b = [i["id"] for i in client.get("/ideas").json()]

    provider.step_output = {
        "links": [
            {"a": b, "b": a, "reason": "都在處理排隊"},
            {"a": a, "b": b, "reason": "重複的一對"},
            {"a": a, "b": a, "reason": "自己連自己"},
            {"a": a, "b": 999, "reason": "不存在的想法"},
        ]
    }
    res = client.post("/idea-links/analyze", json={"provider": "fake"})
    assert res.status_code == 200, res.text
    assert [(l["a"], l["b"], l["reason"]) for l in res.json()] == [(a, b, "都在處理排隊")]

    provider.step_output = {"links": []}
    assert client.post("/idea-links/analyze", json={"provider": "fake"}).status_code == 502
    # A failed analysis leaves the previous links alone.
    assert len(client.get("/idea-links").json()) == 1


def test_link_analysis_needs_two_ideas(client):
    assert client.post("/idea-links/analyze", json={"provider": "fake"}).status_code == 400


def test_pain_point_link_analysis(client, provider):
    a = client.post("/pain-points", json={"statement": "報帳要等三週", "who": "助教"}).json()["id"]
    b = client.post("/pain-points", json={"statement": "器材借用要填紙本"}).json()["id"]

    provider.step_output = {"links": [{"a": b, "b": a, "reason": "都卡在紙本流程"}]}
    res = client.post("/pain-point-links/analyze", json={"provider": "fake"})
    assert res.status_code == 200, res.text
    assert [(l["a"], l["b"]) for l in res.json()] == [(a, b)]
    # The prompt is the pain point flavour, with the facts it knows.
    assert "痛點庫" in provider.calls[-1]["system_prompt"]
    assert "誰：助教" in provider.calls[-1]["user_prompt"]

    # Deleting either end takes the link with it.
    client.delete(f"/pain-points/{a}")
    assert client.get("/pain-point-links").json() == []


def test_pain_point_link_analysis_needs_two(client):
    client.post("/pain-points", json={"statement": "只有一個"})
    res = client.post("/pain-point-links/analyze", json={"provider": "fake"})
    assert res.status_code == 400
