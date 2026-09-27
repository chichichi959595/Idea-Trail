"""The method-run state machine, end to end through the API.

These cover the paths that were only ever checked by hand: a convergence call
that comes back empty, and the retry that rescues it.
"""

from __future__ import annotations

from app.providers.base import ProviderError


# --------------------------------------------------------------------------
# happy path
# --------------------------------------------------------------------------


def test_run_completes_and_produces_ideas(client, session_id, provider, start_run, answer_all):
    run = start_run()
    payload = answer_all(run)

    assert payload["method_run"]["status"] == "done"
    assert payload["method_run"]["finished_at"] is not None
    assert [i["title"] for i in payload["ideas"]] == [
        "校園午餐預約取餐系統",
        "即時排隊時間查詢地圖",
    ]
    # One call per step (pain_point has 6), plus exactly one convergence call.
    assert len(provider.step_calls) == 6
    assert len(provider.finalize_calls) == 1


def test_ideas_land_on_the_session_board(client, session_id, start_run, answer_all):
    run = start_run()
    answer_all(run)

    ideas = client.get(f"/sessions/{session_id}/ideas").json()
    assert len(ideas) == 2
    assert all(i["source_method"] == "pain_point" for i in ideas)
    assert all(i["is_synthesized"] is False for i in ideas)


def test_run_pins_one_model_for_every_step(client, session_id, provider, start_run, answer_all):
    """A run must not drift between models partway through — every step call
    uses the one model the run was opened with."""
    run = start_run()
    answer_all(run)
    assert {c["model"] for c in provider.step_calls} == {"fake-step-model"}


def test_steps_and_convergence_use_their_own_models(
    client, session_id, provider, start_run, answer_all
):
    """The step agents do a relevance check and jot fragments; convergence is
    what the team actually walks away with. They are separate model picks, and
    each defaults to the provider's own choice for that role."""
    run = start_run()
    assert run["model"] == "fake-model"
    assert run["step_model"] == "fake-step-model"

    answer_all(run)
    assert {c["model"] for c in provider.step_calls} == {"fake-step-model"}
    assert {c["model"] for c in provider.finalize_calls} == {"fake-model"}


def test_step_model_can_be_chosen_explicitly(client, session_id, provider, answer_all):
    """Asking for the deep model on the steps too is allowed — the default is a
    default, not a cap."""
    res = client.post(
        f"/sessions/{session_id}/method-runs",
        json={
            "method_name": "pain_point",
            "provider": "fake",
            "model": "fake-model",
            "step_model": "fake-model",
        },
    )
    assert res.status_code == 200, res.text
    answer_all(res.json())
    assert {c["model"] for c in provider.calls} == {"fake-model"}


def test_unknown_step_model_is_rejected_up_front(client, session_id):
    res = client.post(
        f"/sessions/{session_id}/method-runs",
        json={
            "method_name": "pain_point",
            "provider": "fake",
            "step_model": "not-a-real-model",
        },
    )
    assert res.status_code == 400
    assert "not-a-real-model" in res.json()["detail"]


# --------------------------------------------------------------------------
# the failure that used to be silent
# --------------------------------------------------------------------------


def test_empty_convergence_marks_the_run_failed_not_done(client, session_id, provider, start_run, answer_all):
    """The regression this whole branch exists for: the run used to be marked
    `done` with an empty idea board and no way back."""
    provider.finalize_output = {"ideas": []}

    run = start_run()
    payload = answer_all(run)

    assert payload["method_run"]["status"] == "failed"
    assert payload["method_run"]["finished_at"] is None
    assert payload["ideas"] == []
    assert client.get(f"/sessions/{session_id}/ideas").json() == []


def test_unparseable_convergence_marks_the_run_failed(client, session_id, provider, start_run, answer_all):
    # codex turns invalid JSON into None rather than raising.
    provider.finalize_output = None

    run = start_run()
    payload = answer_all(run)
    assert payload["method_run"]["status"] == "failed"


def test_ideas_missing_required_text_are_dropped(client, session_id, provider, start_run, answer_all):
    provider.finalize_output = {
        "ideas": [
            {"title": "", "description": "沒有標題的想法"},
            {"title": "只有標題", "description": ""},
        ]
    }
    run = start_run()
    payload = answer_all(run)
    assert payload["method_run"]["status"] == "failed"


def test_provider_error_during_convergence_is_a_502(client, session_id, provider, start_run):
    run = start_run()
    # Answer everything but the last step, then make the convergence call blow up.
    while True:
        res = client.get(f"/method-runs/{run['id']}").json()
        if res["current_step_index"] == len(res["steps"]) - 1 and len(res["steps"]) == 6:
            break
        res = client.post(
            f"/method-runs/{run['id']}/answer",
            json={"step_index": res["current_step_index"], "answer": "每天中午都要排很久的隊"},
        ).json()

    provider.raises = ProviderError("claude CLI timed out after 180s")
    res = client.post(
        f"/method-runs/{run['id']}/answer",
        json={"step_index": 5, "answer": "省下的時間可以拿來休息或唸書"},
    )
    assert res.status_code == 502
    assert "timed out" in res.text
    # Still retryable — the run was never closed out.
    assert client.get(f"/method-runs/{run['id']}").json()["status"] == "running"


# --------------------------------------------------------------------------
# retrying the convergence
# --------------------------------------------------------------------------


def test_retry_rescues_a_failed_run_without_reanswering(client, session_id, provider, start_run, answer_all):
    provider.finalize_output = {"ideas": []}
    run = start_run()
    failed = answer_all(run)
    assert failed["method_run"]["status"] == "failed"

    answers_before = [s["user_answer"] for s in failed["method_run"]["steps"]]
    step_calls_before = len(provider.step_calls)

    provider.finalize_output = {
        "ideas": [
            {"title": "校園午餐預約取餐系統", "description": "先點餐再取件，避開尖峰排隊。"},
            {"title": "即時排隊時間查詢地圖", "description": "顯示附近店家的預估等待時間。"},
        ]
    }
    res = client.post(f"/method-runs/{run['id']}/finalize")
    assert res.status_code == 200, res.text
    payload = res.json()

    assert payload["method_run"]["status"] == "done"
    assert payload["method_run"]["finished_at"] is not None
    assert len(payload["ideas"]) == 2
    # The whole point: only the convergence call is replayed.
    assert len(provider.step_calls) == step_calls_before
    assert [s["user_answer"] for s in payload["method_run"]["steps"]] == answers_before


def test_retry_can_fail_again_and_stay_retryable(client, session_id, provider, start_run, answer_all):
    provider.finalize_output = {"ideas": []}
    run = start_run()
    answer_all(run)

    res = client.post(f"/method-runs/{run['id']}/finalize")
    assert res.status_code == 200
    assert res.json()["method_run"]["status"] == "failed"
    # Still eligible for another attempt.
    assert client.post(f"/method-runs/{run['id']}/finalize").status_code == 200


def test_cannot_retry_a_running_run(client, session_id, start_run):
    run = start_run()
    res = client.post(f"/method-runs/{run['id']}/finalize")
    assert res.status_code == 400
    assert "only a failed run" in res.text


def test_cannot_retry_a_completed_run(client, session_id, start_run, answer_all):
    run = start_run()
    answer_all(run)
    res = client.post(f"/method-runs/{run['id']}/finalize")
    assert res.status_code == 400
    assert "is done" in res.text


def test_retry_on_unknown_run_is_404(client):
    assert client.post("/method-runs/9999/finalize").status_code == 404


# --------------------------------------------------------------------------
# answering: the relevance gate, force-submit, skipping, stale submissions
# --------------------------------------------------------------------------


def test_off_topic_answer_is_rejected_without_advancing(client, session_id, provider, start_run):
    provider.step_output = {
        "is_relevant": False,
        "clarification": "這個回答看起來跟問題沒有關係，可以再具體說明一下嗎？",
        "analysis": "",
        "idea_fragments": [],
    }
    run = start_run()
    res = client.post(
        f"/method-runs/{run['id']}/answer", json={"step_index": 0, "answer": "asdfasdf"}
    ).json()

    assert res["accepted"] is False
    assert "沒有關係" in res["feedback"]
    assert res["method_run"]["current_step_index"] == 0
    # The step is left clean so the same index can be retried.
    assert res["method_run"]["steps"][0]["user_answer"] is None


def test_force_submit_bypasses_the_relevance_gate(client, session_id, provider, start_run):
    provider.step_output = {
        "is_relevant": False,
        "clarification": "這個回答看起來跟問題沒有關係。",
        "analysis": "",
        "idea_fragments": [],
    }
    run = start_run()
    res = client.post(
        f"/method-runs/{run['id']}/answer",
        json={"step_index": 0, "answer": "就是很煩啊", "force": True},
    ).json()

    assert res["accepted"] is True
    assert res["method_run"]["current_step_index"] == 1
    assert "強制送出" in provider.step_calls[-1]["system_prompt"]


def test_empty_answer_skips_the_step_without_calling_the_llm(client, session_id, provider, start_run):
    run = start_run(method="crazy_8s")
    res = client.post(
        f"/method-runs/{run['id']}/answer", json={"step_index": 0, "answer": "   "}
    ).json()

    assert res["accepted"] is True
    assert res["method_run"]["current_step_index"] == 1
    assert res["method_run"]["steps"][0]["user_answer"] is None
    assert provider.calls == []  # a timed-out step costs nothing


def test_stale_step_index_is_rejected(client, session_id, start_run):
    run = start_run()
    client.post(f"/method-runs/{run['id']}/answer", json={"step_index": 0, "answer": "每天中午排隊排很久"})
    # A retry of the submission that already advanced the run.
    res = client.post(
        f"/method-runs/{run['id']}/answer", json={"step_index": 0, "answer": "每天中午排隊排很久"}
    )
    assert res.status_code == 409
    assert "refetch" in res.text


def test_cannot_answer_a_finished_run(client, session_id, start_run, answer_all):
    run = start_run()
    answer_all(run)
    res = client.post(f"/method-runs/{run['id']}/answer", json={"step_index": 0, "answer": "再來一次"})
    assert res.status_code == 400
    assert "already done" in res.text


# --------------------------------------------------------------------------
# creating a run
# --------------------------------------------------------------------------


def test_unknown_method_is_a_400(client, session_id):
    res = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "no_such_method", "provider": "fake"},
    )
    assert res.status_code == 400
    assert "no implemented FrameworkAgent" in res.text


def test_unknown_model_is_a_400(client, session_id):
    res = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "pain_point", "provider": "fake", "model": "gpt-9-imaginary"},
    )
    assert res.status_code == 400
    assert "unknown model" in res.text


def test_unknown_session_is_a_404(client):
    res = client.post(
        "/sessions/9999/method-runs", json={"method_name": "pain_point", "provider": "fake"}
    )
    assert res.status_code == 404


def test_timed_steps_carry_their_countdown(client, session_id, start_run):
    run = start_run(method="crazy_8s")
    assert run["steps"][0]["timer_seconds"] is None  # the framing question isn't timed
    res = client.post(
        f"/method-runs/{run['id']}/answer", json={"step_index": 0, "answer": "學生常常忘記繳交作業"}
    ).json()
    assert res["method_run"]["steps"][1]["timer_seconds"] == 30
