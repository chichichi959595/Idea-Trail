"""多人接龍 — the host's laptop and every participant's phone.

Two audiences, two route prefixes, and the split is load-bearing:

* `/relay-runs/{id}/...` — the host screen (the run itself is opened by
  `POST /sessions/{id}/method-runs` like any other method's). These
  are only reachable from the machine running the app (see `app.access`).
* `/relay/{code}/...` — the phones. The only routes a request arriving over
  the LAN or an ngrok tunnel can reach, and every one of them is scoped to the
  caller's own paper by their participant token.

There is no background timer. A round closes the next time anyone looks at the
run after everyone has submitted or the deadline has passed — the host screen
polls every second, so in practice that is within a second. One process, a
handful of phones, no scheduler to keep alive.
"""

from __future__ import annotations

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app import relay
from app.api.serializers import pain_point_to_dict
from app.db.models import MethodRun, PainPoint, Participant, RelayCell
from app.db.session import get_db

router = APIRouter(tags=["relay"])

def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _aware(value: dt.datetime) -> dt.datetime:
    # SQLite hands datetimes back without their tzinfo; they were written as UTC.
    return value if value.tzinfo else value.replace(tzinfo=dt.timezone.utc)


def _iso(value: Optional[dt.datetime]) -> Optional[str]:
    return _aware(value).isoformat() if value else None


# --------------------------------------------------------------------------
# requests
# --------------------------------------------------------------------------


class JoinRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=50)


class SubmitCellRequest(BaseModel):
    # Empty is allowed: it's what a phone sends when its timer runs out.
    answer_text: str = Field(default="", max_length=500)


class FlagCellRequest(BaseModel):
    flagged: bool = True


# --------------------------------------------------------------------------
# loading
# --------------------------------------------------------------------------


def _load_host_run(db: DbSession, run_id: int) -> MethodRun:
    run = db.get(MethodRun, run_id)
    if run is None or run.mode != "relay":
        raise HTTPException(404, "relay run not found")
    return run


def _load_run_by_code(db: DbSession, code: str) -> MethodRun:
    # Codes are only unique among live runs, so take the newest — an old
    # revealed run that happened to draw the same four letters is history.
    run = db.scalars(
        select(MethodRun)
        .where(MethodRun.mode == "relay", MethodRun.join_code == code.upper())
        .order_by(MethodRun.id.desc())
        .limit(1)
    ).first()
    if run is None:
        raise HTTPException(404, "找不到這個代碼，確認一下大螢幕上的代碼")
    return run


def _load_participant(db: DbSession, run: MethodRun, token: Optional[str]) -> Participant:
    if not token:
        raise HTTPException(401, "missing participant token")
    me = db.scalars(
        select(Participant).where(
            Participant.method_run_id == run.id, Participant.token == token
        )
    ).first()
    if me is None:
        raise HTTPException(401, "unknown participant token")
    return me


def _cells_by_position(run: MethodRun) -> dict[tuple[int, int], RelayCell]:
    return {(c.chain_index, c.round_index): c for c in run.relay_cells}


# --------------------------------------------------------------------------
# the round clock
# --------------------------------------------------------------------------


def _deadline(run: MethodRun) -> Optional[dt.datetime]:
    if run.status != "writing" or run.relay_round_started_at is None:
        return None
    rung = run.relay_rungs[run.current_step_index]
    return _aware(run.relay_round_started_at) + dt.timedelta(seconds=rung["timer_seconds"])


def _maybe_advance(db: DbSession, run: MethodRun, *, force: bool = False) -> None:
    """Close the current round if it's over, and open the next one.

    A round is over when every paper in it has been handed in, or when the
    deadline (plus a short grace for in-flight auto-submits) has passed —
    whichever is first. Nobody waits on a phone that went to sleep. `force`
    closes it regardless — the host's 「下一輪」 button.

    Several requests can arrive here at once (the host's poll, a phone's poll,
    the last submit), so the move is a compare-and-set on the round number:
    only the first one to see round r still open moves it to r + 1.
    """
    if run.status != "writing":
        return
    deadline = _deadline(run)
    round_index = run.current_step_index
    pending = [
        c for c in run.relay_cells if c.round_index == round_index and c.submitted_at is None
    ]
    expired = deadline is not None and _now() > deadline + dt.timedelta(
        seconds=relay.SUBMIT_GRACE_SECONDS
    )
    if pending and not expired and not force:
        return

    now = _now()
    values: dict = {"relay_round_started_at": now}
    if round_index + 1 < len(run.relay_rungs):
        values["current_step_index"] = round_index + 1
    else:
        values.update(status="revealed", finished_at=now, relay_round_started_at=None)

    db.execute(
        update(MethodRun)
        .where(
            MethodRun.id == run.id,
            MethodRun.status == "writing",
            MethodRun.current_step_index == round_index,
        )
        .values(**values)
    )
    db.commit()
    db.refresh(run)


# --------------------------------------------------------------------------
# serialization
# --------------------------------------------------------------------------


def _chains(
    run: MethodRun, *, with_authors: bool, saved: dict[int, int] | None = None
) -> list[dict]:
    n = len(run.participants)
    by_pos = _cells_by_position(run)
    by_id = {p.id: p for p in run.participants}
    chains = []
    for chain_index in range(n):
        cells = []
        for round_index, rung in enumerate(run.relay_rungs or []):
            cell = by_pos.get((chain_index, round_index))
            if cell is None:
                continue
            entry = {
                "round_index": round_index,
                "question": rung["question"],
                "role": rung["role"],
                "answer": cell.answer_text,
                "flagged_unclear": cell.flagged_unclear,
            }
            if with_authors:
                author = by_id.get(cell.participant_id)
                entry["author"] = author.display_name if author else None
                entry["latency_ms"] = cell.latency_ms
            cells.append(entry)
        chain = {"chain_index": chain_index, "cells": cells}
        if saved is not None:
            chain["pain_point_id"] = saved.get(chain_index)
        chains.append(chain)
    return chains


def _saved_chains(db: DbSession, run: MethodRun) -> dict[int, int]:
    """chain index -> the pain point saved off it."""
    rows = db.execute(
        select(PainPoint.relay_chain_index, PainPoint.id).where(
            PainPoint.method_run_id == run.id, PainPoint.relay_chain_index.is_not(None)
        )
    )
    return {chain_index: pain_point_id for chain_index, pain_point_id in rows}


def _round_progress(run: MethodRun) -> dict:
    cells = [c for c in run.relay_cells if c.round_index == run.current_step_index]
    return {
        "submitted": sum(1 for c in cells if c.submitted_at is not None),
        "total": len(cells),
    }


def _clock(run: MethodRun) -> dict:
    """Deadline plus the server's own idea of now, so a phone whose clock is
    two minutes off still counts down from the right number."""
    rung = run.relay_rungs[run.current_step_index] if run.status == "writing" else None
    return {
        "timer_seconds": rung["timer_seconds"] if rung else None,
        "deadline_at": _iso(_deadline(run)),
        "server_now": _now().isoformat(),
    }


def _host_state(run: MethodRun, db: DbSession) -> dict:
    # Before the start, the ladder the room will get.
    rungs = run.relay_rungs or relay.DEFAULT_RUNGS
    data = {
        "id": run.id,
        "session_id": run.session_id,
        "join_code": run.join_code,
        "status": run.status,
        "min_participants": relay.MIN_PARTICIPANTS,
        "participants": [
            {"id": p.id, "display_name": p.display_name, "seat_index": p.seat_index}
            for p in run.participants
        ],
        "rungs": [{"question": r["question"], "role": r["role"]} for r in rungs],
        "round_index": run.current_step_index,
        "rounds": len(run.relay_rungs) if run.relay_rungs else None,
        "started_at": _iso(run.started_at),
        "finished_at": _iso(run.finished_at),
    }
    if run.status == "writing":
        data["progress"] = _round_progress(run)
        data.update(_clock(run))
    if run.status == "revealed":
        data["chains"] = _chains(run, with_authors=True, saved=_saved_chains(db, run))
    return data


def _participant_state(run: MethodRun, me: Participant) -> dict:
    """What one phone is allowed to see: its own seat, and the one paper in
    its hands. Other chains are never sent — not hidden by the UI, absent from
    the response — until the host reveals them all at once."""
    data: dict = {
        "status": run.status,
        "join_code": run.join_code,
        "me": {"display_name": me.display_name, "seat_index": me.seat_index},
        "participant_count": len(run.participants),
        "min_participants": relay.MIN_PARTICIPANTS,
    }
    if run.status == "writing":
        n = len(run.participants)
        round_index = run.current_step_index
        chain_index = relay.chain_for(me.seat_index, round_index, n)
        by_pos = _cells_by_position(run)
        mine = by_pos[(chain_index, round_index)]
        paper = []
        for r in range(round_index):
            cell = by_pos[(chain_index, r)]
            paper.append(
                {
                    "cell_id": cell.id,
                    "round_index": r,
                    "question": run.relay_rungs[r]["question"],
                    "answer": cell.answer_text,
                    "flagged_unclear": cell.flagged_unclear,
                }
            )
        data["round"] = {
            "cell_id": mine.id,
            "round_index": round_index,
            "rounds": len(run.relay_rungs),
            "question": run.relay_rungs[round_index]["question"],
            "paper": paper,
            "submitted": mine.submitted_at is not None,
            "progress": _round_progress(run),
            **_clock(run),
        }
    if run.status == "revealed":
        data["chains"] = _chains(run, with_authors=False)
    return data


def _chain_to_pain_point(run: MethodRun, chain_index: int) -> PainPoint | None:
    """A chain read as a pain point, layer by layer through the rungs' roles —
    nothing rewritten: it's the room's own words that go into the library.
    None when the pain layer itself was left blank."""
    by_role: dict[str, str] = {}
    by_pos = _cells_by_position(run)
    for round_index, rung in enumerate(run.relay_rungs or []):
        cell = by_pos.get((chain_index, round_index))
        if cell is not None and cell.answer_text:
            # A later layer of the same role (papers come back round in a
            # small room) adds to the earlier one rather than replacing it.
            prior = by_role.get(rung["role"])
            by_role[rung["role"]] = f"{prior}；{cell.answer_text}" if prior else cell.answer_text
    if not by_role.get("pain"):
        return None
    return PainPoint(
        session_id=run.session_id,
        statement=by_role["pain"],
        who=by_role.get("who"),
        context=by_role.get("context"),
        current_workaround=by_role.get("current_fix"),
        source="discovery",
        method_run_id=run.id,
        relay_chain_index=chain_index,
    )


# --------------------------------------------------------------------------
# host
# --------------------------------------------------------------------------


def open_relay_run(db: DbSession, run: MethodRun) -> None:
    """Turn a freshly built MethodRun into a relay lobby with a join code.

    Called from `create_method_run` — the relay is one of the methods and
    starts from the same request as every other; only what gets laid out
    differs (a lobby and a code instead of a first step).
    """
    live_codes = set(
        db.scalars(
            select(MethodRun.join_code).where(
                MethodRun.mode == "relay", MethodRun.status != "revealed"
            )
        )
    )
    code = relay.new_join_code()
    while code in live_codes:
        code = relay.new_join_code()
    run.mode = "relay"
    run.status = "lobby"
    run.join_code = code


@router.get("/relay-runs/{run_id}")
def get_relay_run(run_id: int, db: DbSession = Depends(get_db)):
    run = _load_host_run(db, run_id)
    _maybe_advance(db, run)
    return _host_state(run, db)


@router.post("/relay-runs/{run_id}/start")
def start_relay_run(run_id: int, db: DbSession = Depends(get_db)):
    """Freeze the seats, fix the ladder, and lay out the whole grid at once.

    Every cell exists from here on, empty until written, so a round's progress
    is just a count of filled cells and a phone that never comes back leaves
    a visible gap rather than a missing row.
    """
    run = _load_host_run(db, run_id)
    if run.status != "lobby":
        raise HTTPException(409, f"relay run is already {run.status}")
    n = len(run.participants)
    if n < relay.MIN_PARTICIPANTS:
        raise HTTPException(
            400, f"至少要 {relay.MIN_PARTICIPANTS} 個人才能接龍，現在只有 {n} 個"
        )

    run.relay_rungs = [dict(r) for r in relay.DEFAULT_RUNGS]
    rounds = len(run.relay_rungs)
    by_seat = {p.seat_index: p for p in run.participants}
    for round_index in range(rounds):
        for chain_index in range(n):
            seat = relay.seat_for(chain_index, round_index, n)
            db.add(
                RelayCell(
                    method_run_id=run.id,
                    chain_index=chain_index,
                    round_index=round_index,
                    participant_id=by_seat[seat].id,
                )
            )
    run.status = "writing"
    run.current_step_index = 0
    run.relay_round_started_at = _now()
    db.commit()
    db.refresh(run)
    return _host_state(run, db)


@router.post("/relay-runs/{run_id}/chains/{chain_index}/pain-point")
def save_chain_as_pain_point(run_id: int, chain_index: int, db: DbSession = Depends(get_db)):
    """Put one chain off the wall into the pain point library.

    The host picks which, after the room has talked them over: some chains
    end on a real snag and some trail off, and only the room can tell. Saving
    the same chain twice hands back the one already saved.
    """
    run = _load_host_run(db, run_id)
    if run.status != "revealed":
        raise HTTPException(409, "公布之後才能存進痛點庫")
    if not 0 <= chain_index < len(run.participants):
        raise HTTPException(404, "chain not found")
    existing = db.scalars(
        select(PainPoint).where(
            PainPoint.method_run_id == run.id, PainPoint.relay_chain_index == chain_index
        )
    ).first()
    if existing is not None:
        return pain_point_to_dict(existing)
    pain_point = _chain_to_pain_point(run, chain_index)
    if pain_point is None:
        raise HTTPException(400, "這一條的卡點沒有人寫，存不了")
    db.add(pain_point)
    db.commit()
    db.refresh(pain_point)
    return pain_point_to_dict(pain_point)


@router.post("/relay-runs/{run_id}/advance")
def advance_relay_run(run_id: int, db: DbSession = Depends(get_db)):
    """Close the current round now. For the host who can see the room is done
    even though one phone hasn't said so."""
    run = _load_host_run(db, run_id)
    if run.status != "writing":
        raise HTTPException(409, f"relay run is {run.status}, not writing")
    _maybe_advance(db, run, force=True)
    return _host_state(run, db)


# --------------------------------------------------------------------------
# participants
# --------------------------------------------------------------------------


@router.get("/relay/{code}")
def peek_relay_run(code: str, db: DbSession = Depends(get_db)):
    """Enough for the join screen to say whether the door is still open."""
    run = _load_run_by_code(db, code)
    return {
        "join_code": run.join_code,
        "status": run.status,
        "participant_count": len(run.participants),
    }


@router.post("/relay/{code}/join")
def join_relay_run(code: str, payload: JoinRequest, db: DbSession = Depends(get_db)):
    run = _load_run_by_code(db, code)
    if run.status != "lobby":
        # Seats are the rotation; a late seat would need a chain of its own,
        # written from round one, that nobody has time left to start.
        raise HTTPException(409, "這一場已經開始了，下一場再一起來")
    if len(run.participants) >= relay.MAX_PARTICIPANTS:
        raise HTTPException(409, "人數已滿")
    name = payload.display_name.strip()
    if not name:
        raise HTTPException(400, "名字不能是空的")

    me = Participant(
        method_run_id=run.id,
        display_name=name,
        seat_index=len(run.participants),
        token=relay.new_participant_token(),
    )
    db.add(me)
    try:
        db.commit()
    except IntegrityError as exc:  # pragma: no cover — token collision
        db.rollback()
        raise HTTPException(409, "請再試一次") from exc
    db.refresh(run)
    return {"token": me.token, **_participant_state(run, me)}


@router.get("/relay/{code}/me")
def my_relay_state(
    code: str,
    x_relay_token: Optional[str] = Header(default=None),
    db: DbSession = Depends(get_db),
):
    run = _load_run_by_code(db, code)
    me = _load_participant(db, run, x_relay_token)
    _maybe_advance(db, run)
    return _participant_state(run, me)


def _load_cell(db: DbSession, run: MethodRun, cell_id: int) -> RelayCell:
    cell = db.get(RelayCell, cell_id)
    if cell is None or cell.method_run_id != run.id:
        raise HTTPException(404, "cell not found")
    return cell


@router.post("/relay/{code}/cells/{cell_id}")
def submit_relay_cell(
    code: str,
    cell_id: int,
    payload: SubmitCellRequest,
    x_relay_token: Optional[str] = Header(default=None),
    db: DbSession = Depends(get_db),
):
    run = _load_run_by_code(db, code)
    me = _load_participant(db, run, x_relay_token)
    cell = _load_cell(db, run, cell_id)
    if cell.participant_id != me.id:
        raise HTTPException(403, "這一格不是你的")

    _maybe_advance(db, run)
    if run.status != "writing" or cell.round_index != run.current_step_index:
        raise HTTPException(409, "這一輪已經結束了")
    if cell.submitted_at is not None:
        raise HTTPException(409, "已經交過了")

    now = _now()
    text = payload.answer_text.strip()
    cell.answer_text = text or None
    cell.submitted_at = now
    cell.latency_ms = int((now - _aware(run.relay_round_started_at)).total_seconds() * 1000)
    db.commit()
    # The last paper in closes the round on the spot, rather than leaving the
    # room staring at "5/5" until someone's next poll.
    _maybe_advance(db, run)
    return _participant_state(run, me)


@router.post("/relay/{code}/cells/{cell_id}/flag")
def flag_relay_cell(
    code: str,
    cell_id: int,
    payload: FlagCellRequest,
    x_relay_token: Optional[str] = Header(default=None),
    db: DbSession = Depends(get_db),
):
    """「這個我看不懂」 — on any layer of the paper in your hands, not just the
    one before yours. A flag never blocks anything; it's discussion material
    for the reveal."""
    run = _load_run_by_code(db, code)
    me = _load_participant(db, run, x_relay_token)
    cell = _load_cell(db, run, cell_id)

    _maybe_advance(db, run)
    if run.status != "writing":
        raise HTTPException(409, "這一輪已經結束了")
    holding = relay.chain_for(me.seat_index, run.current_step_index, len(run.participants))
    if cell.chain_index != holding or cell.round_index >= run.current_step_index:
        # Only what's on your own paper — anything else would confirm that a
        # cell id belongs to a chain you're not supposed to know about.
        raise HTTPException(404, "cell not found")

    cell.flagged_unclear = payload.flagged
    db.commit()
    return _participant_state(run, me)
