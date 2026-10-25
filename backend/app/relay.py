"""多人接龍 (relay brainwriting): the rules of the activity, with no I/O.

Everything that decides who holds which paper lives here, so the API layer only
has to load rows and call these. Design notes are in `發散/多人接龍.md`.
"""

from __future__ import annotations

import secrets
from typing import Literal, TypedDict

MIN_PARTICIPANTS = 2
"""One person has nobody to pass a paper to. Two is enough: they play the
same ladder as everyone else, with papers coming back round — see `DEFAULT_RUNGS`."""

MAX_PARTICIPANTS = 40

BASE_WRITE_SECONDS = 45
READ_SECONDS_PER_LAYER = 15
"""The whole paper is passed on, so round r opens with r layers to read before
anyone can write. A flat timer would starve the later rounds."""

SUBMIT_GRACE_SECONDS = 3
"""How long past the deadline a round stays open. Phones auto-submit whatever
is in the box when their countdown hits zero, and that request needs a moment
to land before the round closes under it."""

RungRole = Literal["who", "context", "pain", "current_fix", "other"]


class Rung(TypedDict):
    question: str
    role: RungRole
    """What kind of thing this layer asks for. Ladders will be generated per
    room later, so a round index alone won't say whether layer 3 is a scene or
    a pain point — the role is what lets chains from different runs line up."""
    timer_seconds: int


def timer_for(round_index: int) -> int:
    return BASE_WRITE_SECONDS + READ_SECONDS_PER_LAYER * round_index


# Stage 1 deliberately has no model in the loop: a fixed three-rung ladder, so
# the activity itself can be play-tested without anyone waiting on a call.
# Every rung digs one layer deeper and none asks to revise what is already on
# the paper — once people start "fixing" the previous layer, every chain gets
# pulled back into its author's comfort zone.
#
# Every room gets the whole ladder, whatever its size. With fewer people than
# rungs a paper comes back round to someone who has already written on it —
# it used to be cut short to stop that, but a two-person room then never got
# past "who", and a second turn on your own line, after someone else has bent
# it, is fine.
DEFAULT_RUNGS: list[Rung] = [
    {
        "question": "想一個具體的使用者是誰？越具體越好（例如：夜班護理師、國小代課老師、里幹事）",
        "role": "who",
        "timer_seconds": timer_for(0),
    },
    {
        "question": "這個使用者在什麼情境下會需要幫忙？",
        "role": "context",
        "timer_seconds": timer_for(1),
    },
    {
        "question": "在那個情境裡，他實際會卡在哪裡？",
        "role": "pain",
        "timer_seconds": timer_for(2),
    },
]


def chain_for(seat_index: int, round_index: int, n: int) -> int:
    """Which chain seat `seat_index` holds in round `round_index`.

    Chain c starts at seat c and moves one seat to the right each round, so
    the inverse is seat - round. With at least as many people as rounds,
    nobody gets back a chain they already wrote on; with fewer, papers come
    round again — but never twice in a row, as long as there are two seats.
    """
    return (seat_index - round_index) % n


def seat_for(chain_index: int, round_index: int, n: int) -> int:
    """Who writes on chain `chain_index` in round `round_index` — the inverse
    of `chain_for`."""
    return (chain_index + round_index) % n


# No 0/O, 1/I/L: the code is read off a projector and typed on a phone.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_join_code(length: int = 4) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


def new_participant_token() -> str:
    return secrets.token_urlsafe(24)
