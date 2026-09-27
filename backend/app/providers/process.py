"""Launching and reliably killing a local CLI.

Both CLI providers shell out to an agent harness: it forks helpers of its own
and holds an HTTP request open on the model. That makes "kill the process we
launched" not the same thing as "stop the work" — the children keep going, and
for a stopped call that means output the user is still paying for. So every
CLI here is launched in its own process group and killed by group.
"""

from __future__ import annotations

import asyncio
import os
import signal


async def spawn(*argv: str) -> asyncio.subprocess.Process:
    """Start a CLI with no stdin, pipes on both outputs, and its own session.

    `stdin=DEVNULL` because neither CLI is ever given input and both block for
    ~3s waiting for it ("no stdin data received in 3s"). `start_new_session`
    is what makes `kill_tree` able to take the harness's children with it.
    """
    return await asyncio.create_subprocess_exec(
        *argv,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        start_new_session=True,
    )


def kill_tree(proc: asyncio.subprocess.Process) -> None:
    """SIGKILL the CLI and everything it spawned. Safe to call twice."""
    if proc.returncode is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        # The group is already gone, or this platform won't let us signal it —
        # the direct kill is still worth trying.
        try:
            proc.kill()
        except ProcessLookupError:
            pass


async def communicate(
    proc: asyncio.subprocess.Process, *, timeout: float
) -> tuple[bytes, bytes]:
    """Wait for a CLI to finish, killing it off on a timeout or a stop.

    The stop path is the reason this exists: when the user interrupts a call,
    `asyncio` cancels whatever is awaiting the provider, the CancelledError
    lands here, and without the kill the CLI would run to completion unwatched.
    """
    try:
        return await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        kill_tree(proc)
        raise
