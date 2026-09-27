"""The SSE variants of the calls the user waits on.

Two things matter here. First, a streaming endpoint must do *exactly* the same
work as its plain POST twin — they share one generator precisely so they can't
drift, and these tests are what proves the sharing holds. Second, a provider
that can't stream must still work through the streaming endpoint, emitting a
lone `result`, so the frontend never has to ask which kind it's talking to.
"""

from __future__ import annotations

import json


def parse_sse(text: str) -> list[dict]:
    """Pull the JSON payloads out of an SSE body, in order."""
    events = []
    for block in text.strip().split("\n\n"):
        if not block.strip():
            continue
        data = next(line[len("data: ") :] for line in block.splitlines() if line.startswith("data: "))
        events.append(json.loads(data))
    return events


def start_streaming_run(client, session_id, method="pain_point"):
    res = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": method, "provider": "fake-streaming", "model": "fake-model"},
    )
    assert res.status_code == 200, res.text
    return res.json()


# --------------------------------------------------------------------------
# answering a step
# --------------------------------------------------------------------------


def test_streamed_answer_sends_thinking_before_the_result(
    client, session_id, streaming_provider
):
    run = start_streaming_run(client, session_id)
    res = client.post(
        f"/method-runs/{run['id']}/answer/stream",
        json={"step_index": 0, "answer": "午餐尖峰時段每次都要排十五分鐘以上"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")

    events = parse_sse(res.text)
    kinds = [e["kind"] for e in events]
    assert kinds == ["thinking", "thinking", "result"]
    assert "".join(e["text"] for e in events[:2]) == "".join(
        streaming_provider.thinking_chunks
    )
    assert events[-1]["payload"]["accepted"] is True


def test_streamed_answer_advances_the_run_exactly_like_the_plain_post(
    client, session_id, streaming_provider
):
    """The streaming endpoint is not a read-only preview — it does the real
    work, once."""
    run = start_streaming_run(client, session_id)
    res = client.post(
        f"/method-runs/{run['id']}/answer/stream",
        json={"step_index": 0, "answer": "午餐尖峰時段每次都要排十五分鐘以上"},
    )
    payload = parse_sse(res.text)[-1]["payload"]
    assert payload["method_run"]["current_step_index"] == 1
    assert len(streaming_provider.step_calls) == 1

    fetched = client.get(f"/method-runs/{run['id']}").json()
    assert fetched["current_step_index"] == 1


def test_a_provider_that_cannot_stream_still_works_through_the_sse_endpoint(
    client, session_id, provider
):
    """`fake` has no `stream` method — one `result` event and nothing else."""
    res = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "pain_point", "provider": "fake", "model": "fake-model"},
    )
    run = res.json()
    res = client.post(
        f"/method-runs/{run['id']}/answer/stream",
        json={"step_index": 0, "answer": "午餐尖峰時段每次都要排十五分鐘以上"},
    )
    events = parse_sse(res.text)
    assert [e["kind"] for e in events] == ["result"]
    assert events[0]["payload"]["accepted"] is True


def test_an_off_topic_answer_streams_a_rejection_not_an_error(
    client, session_id, streaming_provider
):
    streaming_provider.step_output = {
        "is_relevant": False,
        "clarification": "這一步想問的是你自己最近覺得麻煩的事。",
        "analysis": "",
        "idea_fragments": [],
    }
    run = start_streaming_run(client, session_id)
    res = client.post(
        f"/method-runs/{run['id']}/answer/stream",
        json={"step_index": 0, "answer": "asdf"},
    )
    payload = parse_sse(res.text)[-1]["payload"]
    assert payload["accepted"] is False
    assert "麻煩的事" in payload["feedback"]
    assert payload["method_run"]["current_step_index"] == 0


def test_a_stale_step_index_is_still_a_409_not_an_sse_error_event(
    client, session_id, streaming_provider
):
    """Validated before the response starts, so the client gets a real status
    code instead of a 200 containing an error."""
    run = start_streaming_run(client, session_id)
    res = client.post(
        f"/method-runs/{run['id']}/answer/stream",
        json={"step_index": 3, "answer": "不對的步驟"},
    )
    assert res.status_code == 409


# --------------------------------------------------------------------------
# the other three call sites
# --------------------------------------------------------------------------


def test_method_recommendation_streams(client, session_id, streaming_provider):
    streaming_provider.step_output = {
        "adjustment": "照用規則排序。",
        "items": [
            {"method": "pain_point", "rationale": "他們已經講出具體的麻煩。"},
            {"method": "user_journey", "rationale": "排隊是一段有前後的流程。"},
            {"method": "how_might_we", "rationale": "可以把問題改寫成一句提問。"},
        ],
    }
    res = client.post(
        f"/sessions/{session_id}/method-recommendation/stream?provider=fake-streaming&model=fake-model"
    )
    assert res.status_code == 200
    events = parse_sse(res.text)
    assert [e["kind"] for e in events] == ["thinking", "thinking", "result"]
    assert len(events[-1]["payload"]["recommendations"]) == 3


def test_convergence_streams_on_the_last_step(client, session_id, streaming_provider):
    """The finalize call is the slowest one in a run, so its deltas matter
    most — and they arrive on the same stream as the last step's."""
    run = start_streaming_run(client, session_id, method="pain_point")
    last_payload = None
    while True:
        res = client.post(
            f"/method-runs/{run['id']}/answer/stream",
            json={
                "step_index": (last_payload or run)["current_step_index"]
                if last_payload is None
                else last_payload["method_run"]["current_step_index"],
                "answer": "午餐尖峰時段每次都要排十五分鐘以上",
            },
        )
        assert res.status_code == 200, res.text
        events = parse_sse(res.text)
        last_payload = events[-1]["payload"]
        if last_payload["method_run"]["status"] != "running":
            break

    # Two calls streamed on that final request: the step agent and convergence.
    assert [e["kind"] for e in events].count("thinking") == 4
    assert last_payload["method_run"]["status"] == "done"
    assert len(last_payload["ideas"]) == 2


def test_synthesize_streams(client, session_id, streaming_provider):
    run = start_streaming_run(client, session_id)
    payload = {"method_run": run}
    while payload["method_run"]["status"] == "running":
        res = client.post(
            f"/method-runs/{run['id']}/answer/stream",
            json={
                "step_index": payload["method_run"]["current_step_index"],
                "answer": "午餐尖峰時段每次都要排十五分鐘以上",
            },
        )
        payload = parse_sse(res.text)[-1]["payload"]

    ideas = client.get(f"/sessions/{session_id}/ideas").json()
    # The synthesis call wants ideas back, not a step verdict.
    streaming_provider.step_output = {
        "ideas": [
            {"title": "校園取餐與等待時間整合平台", "description": "把預約取餐與等待時間預估合成一個入口。"}
        ]
    }
    res = client.post(
        f"/sessions/{session_id}/synthesize/stream",
        json={
            "idea_ids": [i["id"] for i in ideas],
            "provider": "fake-streaming",
            "model": "fake-model",
        },
    )
    assert res.status_code == 200
    events = parse_sse(res.text)
    assert [e["kind"] for e in events] == ["thinking", "thinking", "result"]
    assert len(events[-1]["payload"]) == 1


def test_a_failure_after_the_first_byte_arrives_as_an_error_event(
    client, session_id, streaming_provider
):
    """Once the 200 and the first delta are on the wire the status can't be
    changed, so the only channel left is an `error` event — and the client has
    to treat that as fatal rather than waiting for a `result`."""
    run = start_streaming_run(client, session_id)
    payload = {"method_run": run}
    while payload["method_run"]["status"] == "running":
        res = client.post(
            f"/method-runs/{run['id']}/answer/stream",
            json={
                "step_index": payload["method_run"]["current_step_index"],
                "answer": "午餐尖峰時段每次都要排十五分鐘以上",
            },
        )
        payload = parse_sse(res.text)[-1]["payload"]

    ideas = client.get(f"/sessions/{session_id}/ideas").json()
    # Leaves the synthesis call returning nothing usable, which is a 502 on the
    # plain endpoint.
    streaming_provider.step_output = {"ideas": []}
    res = client.post(
        f"/sessions/{session_id}/synthesize/stream",
        json={
            "idea_ids": [i["id"] for i in ideas],
            "provider": "fake-streaming",
            "model": "fake-model",
        },
    )
    assert res.status_code == 200  # already sent before the failure happened
    events = parse_sse(res.text)
    assert events[-1]["kind"] == "error"
    assert events[-1]["status"] == 502
    assert not any(e["kind"] == "result" for e in events)

