"""專案收斂: each agent stage writes only its own column, and nothing the user
decided (verdict, MoSCoW buckets, matrix placement) is overwritten by an agent.
"""

from __future__ import annotations

import pytest

from app.api import convergence as convergence_api
from app.github_search import GitHubSearchError
from app.providers.base import ProviderError


@pytest.fixture
def project(client, session_id, start_run, answer_all) -> dict:
    idea_id = answer_all(start_run())["ideas"][0]["id"]
    res = client.post("/convergence-projects", json={"idea_id": idea_id, "session_id": session_id})
    assert res.status_code == 200, res.text
    return res.json()


def _features(*buckets):
    return [
        {"id": f"f{i}", "title": f"功能{i}", "description": "說明", "moscow": b}
        for i, b in enumerate(buckets)
    ]


def test_open_is_get_or_create(client, project):
    again = client.post("/convergence-projects", json={"idea_id": project["idea_id"]})
    assert again.json()["id"] == project["id"]
    assert len(client.get("/convergence-projects").json()) == 1


def test_open_unknown_idea_is_404(client):
    assert client.post("/convergence-projects", json={"idea_id": 9999}).status_code == 404


def test_each_debate_call_adds_one_pro_and_one_con_turn(client, project, provider):
    provider.step_output = {"argument": "論點", "key_points": ["重點一", "重點二"]}
    url = f"/convergence-projects/{project['id']}/debate"

    first = client.post(url, json={"provider": "fake", "mode": "analysis"}).json()
    assert [(t["side"], t["round"]) for t in first["debate"]] == [("pro", 1), ("con", 1)]

    second = client.post(
        url, json={"provider": "fake", "mode": "analysis", "focus": "真的有人願意付錢嗎"}
    ).json()
    assert [(t["side"], t["round"]) for t in second["debate"]][2:] == [("pro", 2), ("con", 2)]
    assert second["debate"][-1]["focus"] == "真的有人願意付錢嗎"
    assert second["debate"][-1]["key_points"] == ["重點一", "重點二"]
    # The second round's prompts carry the first round, so each side can answer the other.
    assert "第 1 輪・反方" in provider.calls[-1]["user_prompt"]


def test_dialogue_mode_is_one_short_line_each(client, project, provider):
    provider.step_output = {"argument": "排" * 200, "key_points": ["不該出現"]}
    url = f"/convergence-projects/{project['id']}/debate"

    row = client.post(url, json={"provider": "fake"}).json()  # dialogue is the default
    pro, con = row["debate"]
    assert pro["mode"] == "dialogue"
    assert len(pro["argument"]) <= 80
    assert pro["key_points"] == []
    assert "一人一句" in provider.calls[-1]["system_prompt"]

    # A dialogue line reads as a line of the conversation in the next prompt,
    # whichever mode the next round is in.
    client.post(url, json={"provider": "fake", "mode": "analysis"})
    assert f"反方：{con['argument']}" in provider.calls[-1]["user_prompt"]
    assert "分析模式" in provider.calls[-1]["system_prompt"]


def test_user_line_gets_an_answer_from_the_other_side(client, project, provider):
    provider.step_output = {"argument": "那為什麼大家還在用 Word 手動改？"}
    url = f"/convergence-projects/{project['id']}/debate/reply"
    before = len(provider.calls)

    row = client.post(url, json={"provider": "fake", "side": "con", "text": "組長自己改其實也不慢"}).json()
    user, answer = row["debate"]
    assert (user["speaker"], user["side"], user["argument"]) == ("user", "con", "組長自己改其實也不慢")
    assert (answer["speaker"], answer["side"], answer["mode"]) == ("agent", "pro", "dialogue")
    assert answer["round"] == user["round"]
    assert len(provider.calls) == before + 1  # only the other side answers
    prompt = provider.calls[-1]["user_prompt"]
    assert "反方（使用者本人）：組長自己改其實也不慢" in prompt
    assert "直接回應他" in prompt
    assert "正方 Agent" in provider.calls[-1]["system_prompt"]


def test_failed_reply_does_not_keep_the_user_line(client, project, provider):
    provider.raises = ProviderError("boom")
    url = f"/convergence-projects/{project['id']}/debate/reply"
    assert client.post(url, json={"provider": "fake", "side": "pro", "text": "真的很痛"}).status_code == 502
    assert client.get(f"/convergence-projects/{project['id']}").json()["debate"] == []


def test_blank_user_line_is_rejected(client, project):
    url = f"/convergence-projects/{project['id']}/debate/reply"
    assert client.post(url, json={"provider": "fake", "side": "pro", "text": ""}).status_code == 422


def test_debate_can_be_cleared_but_not_rewritten(client, project, provider):
    provider.step_output = {"argument": "論點", "key_points": []}
    client.post(f"/convergence-projects/{project['id']}/debate", json={"provider": "fake"})
    url = f"/convergence-projects/{project['id']}"
    assert client.patch(url, json={"debate": [{"side": "pro"}]}).status_code == 400
    assert client.patch(url, json={"debate": []}).json()["debate"] == []


def test_user_fields_are_patched_independently(client, project):
    url = f"/convergence-projects/{project['id']}"
    client.patch(url, json={"demand_verdict": "real", "demand_notes": " 訪談過五個人 "})
    row = client.patch(url, json={"decision": "go"}).json()
    assert row["demand_verdict"] == "real"
    assert row["demand_notes"] == "訪談過五個人"
    assert row["decision"] == "go"
    assert client.patch(url, json={"demand_verdict": "maybe"}).status_code == 422


def test_feature_patch_is_cleaned(client, project):
    row = client.patch(
        f"/convergence-projects/{project['id']}",
        json={
            "features": [
                {"id": "a", "title": "登入", "moscow": "must", "impact": 9},
                {"id": "a", "title": "重複 id", "moscow": "nonsense"},
                {"id": "b", "title": "  "},
            ]
        },
    ).json()
    assert [f["title"] for f in row["features"]] == ["登入", "重複 id"]
    assert row["features"][0]["impact"] == 5
    assert row["features"][1]["moscow"] is None
    assert row["features"][1]["id"] != "a"


def test_suggest_appends_unsorted_ai_features_and_skips_duplicates(client, project, provider):
    url = f"/convergence-projects/{project['id']}"
    client.patch(url, json={"features": [{"id": "mine", "title": "登入", "moscow": "must"}]})
    provider.step_output = {
        "features": [
            {"title": "登入", "description": "重複"},
            {"title": "排隊地圖", "description": "看附近排多久"},
        ]
    }
    row = client.post(f"{url}/features/suggest", json={"provider": "fake"}).json()
    assert [(f["title"], f["source"], f["moscow"]) for f in row["features"]] == [
        ("登入", "user", "must"),
        ("排隊地圖", "ai", None),
    ]


def test_impact_effort_needs_sorted_features(client, project):
    url = f"/convergence-projects/{project['id']}"
    client.patch(url, json={"features": _features(None, "wont")})
    assert client.post(f"{url}/impact-effort", json={"provider": "fake"}).status_code == 400


def test_impact_effort_never_moves_what_the_user_already_placed(client, project, provider):
    url = f"/convergence-projects/{project['id']}"
    features = _features("must", "should", "wont")
    features[1].update(impact=1, effort=1)  # the user already dragged this one
    client.patch(url, json={"features": features})
    provider.step_output = {
        "estimates": [
            {"id": fid, "impact": 4, "effort": 5, "rationale": "理由"} for fid in ("f0", "f1", "f2")
        ]
    }
    row = client.post(f"{url}/impact-effort", json={"provider": "fake"}).json()
    must, should, wont = row["features"]
    assert (must["impact"], must["effort"], must["ai_effort"]) == (4, 5, 5)
    assert (should["impact"], should["effort"], should["ai_impact"]) == (1, 1, 4)
    assert wont["ai_impact"] is None
    # Must stays Must however expensive the agent thinks it is.
    assert must["moscow"] == "must"


def test_research_searches_github_and_drops_made_up_links(client, project, provider, monkeypatch):
    searched: list[list[str]] = []

    async def fake_search(queries, per_query=5):
        searched.append(queries)
        return [{"full_name": "a/queue", "url": "https://github.com/a/queue", "stars": 10}]

    monkeypatch.setattr(convergence_api, "search_repositories", fake_search)
    provider.step_output = {
        "queries": ["queue app", "lunch preorder"],
        "summary": "有一個相近的開源專案。",
        "competitors": [
            {"name": "queue", "url": "https://github.com/a/queue", "overlap": "排隊", "gap": "預約"},
            {"name": "編的", "url": "https://example.com/made-up", "overlap": "", "gap": ""},
        ],
        "differentiation": "預約取餐是差異化。",
    }
    row = client.post(
        f"/convergence-projects/{project['id']}/research", json={"provider": "fake"}
    ).json()
    research = row["research"]
    assert searched == [["queue app", "lunch preorder"]]
    assert research["github"][0]["full_name"] == "a/queue"
    assert [c["url"] for c in research["competitors"]] == ["https://github.com/a/queue", None]
    # FakeProvider has no `research` method: web search is skipped, not failed.
    assert research["web_skipped"]


def test_research_survives_a_github_failure(client, project, provider, monkeypatch):
    async def failing(queries, per_query=5):
        raise GitHubSearchError("額度用完")

    monkeypatch.setattr(convergence_api, "search_repositories", failing)
    provider.step_output = {
        "queries": ["x"],
        "summary": "沒有找到。",
        "competitors": [],
        "differentiation": "",
    }
    res = client.post(f"/convergence-projects/{project['id']}/research", json={"provider": "fake"})
    assert res.status_code == 200, res.text
    assert res.json()["research"]["github_error"] == "額度用完"
    assert res.json()["research"]["github"] == []


def test_feasibility_reads_every_earlier_stage(client, project, provider):
    url = f"/convergence-projects/{project['id']}"
    client.patch(url, json={"demand_verdict": "real", "features": _features("must")})
    provider.step_output = {
        "technical": {"score": 9, "rationale": "做得出來", "risks": ["定位"], "suggested_stack": ["React"]},
        "investment": {"score": 3, "rationale": "普通", "effort_estimate": "6 週", "benefit": "省時間"},
        "must_fit": "放得進去",
        "open_questions": ["店家願意配合嗎"],
    }
    row = client.post(f"{url}/feasibility", json={"provider": "fake"}).json()
    assert row["feasibility"]["technical"]["score"] == 5
    assert row["feasibility"]["investment"]["effort_estimate"] == "6 週"
    prompt = provider.calls[-1]["user_prompt"]
    assert "需求成立" in prompt and "Must（一定要有）" in prompt


def test_stream_validates_before_streaming(client, project):
    res = client.post(
        f"/convergence-projects/{project['id']}/impact-effort/stream", json={"provider": "fake"}
    )
    assert res.status_code == 400


def test_stream_emits_result(client, project, streaming_provider):
    streaming_provider.step_output = {"argument": "論點", "key_points": []}
    res = client.post(
        f"/convergence-projects/{project['id']}/debate/stream", json={"provider": "fake-streaming"}
    )
    assert res.status_code == 200
    assert "event: thinking" in res.text
    assert "event: result" in res.text


def test_empty_feasibility_is_an_error_not_a_blank_assessment(client, project, provider):
    provider.step_output = {"technical": {}, "investment": {}, "must_fit": "", "open_questions": []}
    res = client.post(f"/convergence-projects/{project['id']}/feasibility", json={"provider": "fake"})
    assert res.status_code == 502
    assert client.get(f"/convergence-projects/{project['id']}").json()["feasibility"] is None
