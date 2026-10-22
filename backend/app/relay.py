"""多人接龍 (relay brainwriting): the rules of the activity, with no I/O.

Everything that decides who holds which paper lives here, so the API layer only
has to load rows and call these. Design notes are in `發散/多人接龍.md`.
"""

from __future__ import annotations

import secrets
from typing import Literal, TypedDict

MIN_PARTICIPANTS = 2
"""One person has nobody to pass a paper to. Two is enough, on a shorter
ladder — see `ladder_for`."""

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


# Two people can only pass a paper once before it comes back to whoever
# started it, so they get two rungs instead of three. The second one asks for
# the scene and the snag together, so a two-person chain still ends on a
# concrete pain point rather than stopping at "when would they need help".
TWO_PERSON_RUNGS: list[Rung] = [
    DEFAULT_RUNGS[0],
    {
        "question": "這個使用者在什麼情況下會卡住？他實際卡在哪裡？",
        "role": "pain",
        "timer_seconds": timer_for(1),
    },
]


def ladder_for(n_participants: int) -> list[Rung]:
    """The question ladder for a room of this size.

    Rounds can never outnumber people, or somebody gets their own paper back —
    so the room's size decides how many layers one line of thought is cut
    into. Every ladder ends on the pain layer, whatever its length.
    """
    if n_participants >= len(DEFAULT_RUNGS):
        return DEFAULT_RUNGS
    return TWO_PERSON_RUNGS


def chain_for(seat_index: int, round_index: int, n: int) -> int:
    """Which chain seat `seat_index` holds in round `round_index`.

    Chain c starts at seat c and moves one seat to the right each round, so
    the inverse is seat - round. With n >= rounds (which `ladder_for`
    guarantees), nobody ever gets back a chain they already wrote on.
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
