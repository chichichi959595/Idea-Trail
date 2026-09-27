"""Stopping a call that's already in flight.

The ideation screen's send button becomes a stop button while the provider is
working, and the promise that button makes is that the CLI really dies — not
that the browser stops looking at it. So what these tests pin down is the chain
that makes that true: the stop request reaches the generator, the generator
cancels the task awaiting the provider, and the `CancelledError` lands *inside*
the provider call, where `process.kill_tree` is. And nothing is written: a
stopped step is still answerable, on the same question, with no half-run
recorded against it.
"""

from __future__ import annotations

import asyncio
import json

from app.api import method_runs
from app.api.cancel import Cancelled, cancel_scope, request_cancel, stop_on_cancel
from app.db.models import MethodRun
from app.db.session import get_db
from app.main import app
from app.providers import registry
from app.providers.base import LLMResult, ModelOption
from app.schemas.requests import AnswerStepRequest


class HangingProvider:
    """A provider whose call never returns on its own.

    Stands in for a `claude`/`codex` call mid-flight. `cancelled` is what the
    real providers use their own `except CancelledError` for — killing the
    process group — so asserting it flipped is asserting the CLI would have
    been killed.
    """

    name = "hanging"
    label = "Hanging Provider"
    speed_tier = "slow"
    speed_note = "測試用，永遠不會回來。"

    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.cancelled = False

    @property
    def default_model(self) -> str:
        return "hanging-model"

    @property
    def default_step_model(self) -> str:
        return "hanging-model"

    def list_models(self) -> list[ModelOption]:
        return [ModelOption("hanging-model", "Hanging Model", "測試用")]

    async def complete(self, **kwargs) -> LLMResult:
        self.started.set()
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        raise AssertionError("unreachable")  # pragma: no cover

    async def health(self) -> dict:
        return {"ok": True}


def _sse(chunk: bytes) -> dict:
    line = next(l for l in chunk.decode().splitlines() if l.startswith("data: "))
    return json.loads(line[len("data: ") :])


# --------------------------------------------------------------------------
# the primitive
# --------------------------------------------------------------------------


def test_stop_on_cancel_cancels_the_call_it_is_waiting_on():
    """The point of the whole mechanism: the stop is delivered *into* the
    provider coroutine, not merely around it."""
    provider = HangingProvider()

    async def source():
        yield {"kind": "thinking", "text": "想一下…"}
        await provider.complete()
        yield {"kind": "result"}  # pragma: no cover - never reached

    async def scenario():
        cancel = asyncio.Event()
        seen = []
        stream = stop_on_cancel(source(), cancel)
        seen.append(await stream.__anext__())
        # Only stop once the provider is genuinely in its call — stopping
        # before that would prove nothing about reaching into it.
        waiting = asyncio.ensure_future(stream.__anext__())
        await provider.started.wait()
        cancel.set()
        try:
            await waiting
        except Cancelled:
            return seen
        raise AssertionError("expected Cancelled")  # pragma: no cover

    seen = asyncio.run(scenario())
    assert seen == [{"kind": "thinking", "text": "想一下…"}]
    assert provider.cancelled


def test_stop_on_cancel_passes_an_uninterrupted_stream_straight_through():
    async def source():
        for i in range(3):
            yield {"kind": "thinking", "text": str(i)}

    async def scenario():
        return [item async for item in stop_on_cancel(source(), asyncio.Event())]

    assert asyncio.run(scenario()) == [{"kind": "thinking", "text": str(i)} for i in range(3)]


def test_cancel_scope_is_gone_once_the_stream_ends():
    async def scenario():
        with cancel_scope("method-run:7"):
            assert request_cancel("method-run:7") is True
        # Nothing in flight any more, so there is nothing to stop.
        return request_cancel("method-run:7")

    assert asyncio.run(scenario()) is False


# --------------------------------------------------------------------------
# the endpoint
# --------------------------------------------------------------------------


def test_cancel_endpoint_reports_when_there_was_nothing_to_stop(client, start_run):
    """Not an error: the call may simply have landed a beat before the button."""
    run = start_run()
    res = client.post(f"/method-runs/{run['id']}/cancel")
    assert res.status_code == 200
    assert res.json() == {"stopped": False}


def test_cancelling_an_answer_ends_the_stream_without_advancing_the_run(
    client, session_id, monkeypatch
):
    provider = HangingProvider()
    monkeypatch.setitem(registry._PROVIDERS, "hanging", provider)

    run = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "pain_point", "provider": "hanging", "model": "hanging-model"},
    ).json()

    # Driven by hand rather than through TestClient, for two reasons: the stop
    # has to be asked for *while* the body is still being produced, which a
    # synchronous client call gives no window for; and it has to be asked for
    # on the same event loop the stream is waiting on, which is exactly the
    # arrangement uvicorn gives it in production.
    async def scenario():
        db_gen = app.dependency_overrides[get_db]()
        db = next(db_gen)
        try:
            response = await method_runs.answer_step_stream(
                run["id"],
                AnswerStepRequest(step_index=0, answer="午餐尖峰每次都排十五分鐘"),
                db,
            )
            # This provider doesn't stream, so nothing at all reaches the wire
            # until the stop does — the first frame has to be waited for
            # concurrently or the test would deadlock with it.
            first_frame = asyncio.ensure_future(response.body_iterator.__anext__())
            await provider.started.wait()
            stopped = await method_runs.cancel_method_run(run["id"])
            return stopped, _sse(await first_frame)
        finally:
            db_gen.close()

    stopped, frame = asyncio.run(scenario())
    assert stopped == {"stopped": True}
    assert frame["kind"] == "cancelled"
    # The CancelledError reached the provider, which is where the real ones
    # kill the CLI's process group.
    assert provider.cancelled

    # And the run is untouched: same step, no answer stored, still answerable.
    after = client.get(f"/method-runs/{run['id']}").json()
    assert after["status"] == "running"
    assert after["current_step_index"] == 0
    assert after["steps"][0]["user_answer"] is None


def test_a_cancelled_run_can_still_be_answered_afterwards(client, session_id, provider):
    """Stopping is not a dead end — the same step is answerable again."""
    run = client.post(
        f"/sessions/{session_id}/method-runs",
        json={"method_name": "pain_point", "provider": "fake", "model": "fake-model"},
    ).json()
    client.post(f"/method-runs/{run['id']}/cancel")

    res = client.post(
        f"/method-runs/{run['id']}/answer",
        json={"step_index": 0, "answer": "午餐尖峰每次都排十五分鐘"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["accepted"] is True
    assert res.json()["method_run"]["current_step_index"] == 1
