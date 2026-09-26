"""Regression tests for the startup column backfill.

The bug these pin down: the "is this column safe to ALTER in?" guard used to
also accept a Python-side `default=`, which never appears in the generated
DDL. SQLite then rejected the `ADD COLUMN`, and because sync_columns() runs
during app startup that took the whole server down instead of one request.
"""

import sqlalchemy as sa

from app.db.models import Base
from app.db.schema_sync import sync_columns


def _engine_missing_columns(table: str, keep: list[str]) -> sa.Engine:
    """An in-memory DB where `table` exists but only has `keep`'s columns."""
    engine = sa.create_engine("sqlite://")
    cols = ", ".join(f"{c} INTEGER" for c in keep)
    with engine.begin() as conn:
        conn.execute(sa.text(f"CREATE TABLE {table} ({cols})"))
        conn.execute(sa.text(f"INSERT INTO {table} DEFAULT VALUES"))
    return engine


def test_adds_missing_nullable_columns():
    engine = _engine_missing_columns("method_runs", ["id", "session_id"])
    added = sync_columns(engine)
    assert "method_runs.model" in added
    assert "method_runs.finished_at" in added


def test_not_null_python_default_is_skipped_not_crashed():
    # MethodRun.status is NOT NULL with default="running" — a Python-side
    # default, so the DDL carries no DEFAULT and SQLite would refuse it.
    engine = _engine_missing_columns("method_runs", ["id", "session_id"])
    sync_columns(engine)  # must not raise
    cols = {c["name"] for c in sa.inspect(engine).get_columns("method_runs")}
    assert "status" not in cols


def test_is_idempotent():
    engine = sa.create_engine("sqlite://")
    Base.metadata.create_all(engine)
    assert sync_columns(engine) == []


def test_ignores_tables_that_do_not_exist_yet():
    engine = sa.create_engine("sqlite://")
    assert sync_columns(engine) == []
