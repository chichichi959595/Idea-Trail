"""Cooperative cancellation for the calls the user is allowed to interrupt.

The ideation screen's send button turns into a stop button while a provider
call is in flight, and stopping has to mean the CLI subprocess actually dies.
Otherwise "停止" only hides a call that keeps spending the user's subscription
quota for another minute, and the next question waits behind it on the
provider's concurrency semaphore.

Why this isn't just "notice the closed connection": Starlette serves a
`StreamingResponse` on a modern ASGI server by writing into `send()` and
finding out about a disconnect only when that write fails (`responses.py`, the
`spec_version >= (2, 4)` branch — there is no disconnect-listener task any
more). A `claude`/`codex` call emits no deltas at all for ten to sixty seconds,
so there is no write to fail: the disconnect would be noticed only once the
answer has already been paid for. So the client asks for the stop explicitly,
over a second request, and this module is what connects that request to the
generator sitting on the CLI.
"""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from typing import AsyncIterator, Iterator, TypeVar


class Cancelled(Exception):
    """Raised inside a cancellable stream once a stop has been asked for."""


# key -> the event that stops it. One entry per in-flight stream; a method run
# can only have one call in flight at a time, so its id is a sufficient key.
_in_flight: dict[str, asyncio.Event] = {}


@contextmanager
def cancel_scope(key: str) -> Iterator[asyncio.Event]:
    """Make the enclosed stream interruptible as `key` while it runs."""
    cancel = asyncio.Event()
    _in_flight[key] = cancel
    try:
        yield cancel
    finally:
        # Only ever drop our own entry: a retry on the same key may already
        # have replaced it.
        if _in_flight.get(key) is cancel:
            del _in_flight[key]


def request_cancel(key: str) -> bool:
    """Ask the stream registered as `key` to stop. False if nothing is running."""
    cancel = _in_flight.get(key)
    if cancel is None:
        return False
    cancel.set()
    return True


T = TypeVar("T")


async def stop_on_cancel(source: AsyncIterator[T], cancel: asyncio.Event) -> AsyncIterator[T]:
    """Pass `source` through, raising `Cancelled` as soon as `cancel` is set.

    The pending `__anext__` is *cancelled*, not abandoned: that is what delivers
    a `CancelledError` into the provider coroutine, which is where the
    subprocess gets killed. Awaiting the cancelled task before raising gives
    that cleanup time to run, so by the time the stop is reported the CLI is
    already gone.
    """
    iterator = source.__aiter__()
    waiter = asyncio.ensure_future(cancel.wait())
    try:
        while True:
            step = asyncio.ensure_future(iterator.__anext__())
            done, _ = await asyncio.wait({step, waiter}, return_when=asyncio.FIRST_COMPLETED)
            if step not in done:
                step.cancel()
                await asyncio.gather(step, return_exceptions=True)
                raise Cancelled
            try:
                item = step.result()
            except StopAsyncIteration:
                return
            yield item
    finally:
        waiter.cancel()
