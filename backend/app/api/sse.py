"""Server-sent events for the calls the user actually waits on.

Latency on every provider here tracks generated tokens, so a call that takes
fifteen seconds takes fifteen seconds whether or not the browser is watching.
What streaming changes is that the wait stops being blank: the reasoning shows
up as it is produced, which for an ideation tool is content the user wants to
read, not just a progress bar.

Each endpoint's work is written once, as an async generator of events, and
served two ways — drained into a plain JSON response for the existing POST, or
forwarded as SSE. Neither path has its own copy of the logic.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator, Callable

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from app.api.cancel import Cancelled, cancel_scope, stop_on_cancel

logger = logging.getLogger(__name__)

EventStream = AsyncIterator[dict]


def event(kind: str, **fields) -> dict:
    return {"kind": kind, **fields}


async def drain(events: EventStream) -> dict:
    """Run a stream to completion and return its `result` payload.

    This is what the non-streaming endpoints use, so they exercise exactly the
    same code path as the streaming ones.
    """
    payload = None
    async for item in events:
        if item["kind"] == "result":
            payload = item["payload"]
    if payload is None:  # pragma: no cover - a generator that never resolves
        raise HTTPException(500, "event stream ended without a result")
    return payload


def _encode(item: dict) -> bytes:
    return f"event: {item['kind']}\ndata: {json.dumps(item, ensure_ascii=False)}\n\n".encode()


def sse_response(
    make_events: Callable[[], EventStream], *, cancel_key: str | None = None
) -> StreamingResponse:
    """Serve an event stream as SSE.

    The generator is built lazily inside the response so an HTTPException it
    raises before the first event still becomes a normal error response. Once
    bytes are on the wire the status is already sent, so a later failure can
    only be reported as an `error` event — the client has to treat that as
    fatal rather than waiting for a `result` that will never come.

    With a `cancel_key`, the stream is registered as interruptible for as long
    as it runs: a `POST .../cancel` naming that key kills the provider call in
    flight and ends the stream with a `cancelled` event instead of a `result`.
    """

    async def events() -> AsyncIterator[dict]:
        if cancel_key is None:
            async for item in make_events():
                yield item
            return
        with cancel_scope(cancel_key) as cancel:
            async for item in stop_on_cancel(make_events(), cancel):
                yield item

    async def body() -> AsyncIterator[bytes]:
        try:
            async for item in events():
                yield _encode(item)
        except Cancelled:
            # Not an error: the user asked for this, and nothing was committed.
            yield _encode(event("cancelled", detail="這次呼叫已中止"))
        except HTTPException as exc:
            yield _encode(event("error", detail=str(exc.detail), status=exc.status_code))
        except Exception as exc:  # noqa: BLE001 - the connection is the only channel left
            logger.exception("SSE stream failed")
            yield _encode(event("error", detail=str(exc), status=500))

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Without this an nginx/proxy in front buffers the whole response
            # and streaming silently becomes non-streaming.
            "X-Accel-Buffering": "no",
        },
    )
