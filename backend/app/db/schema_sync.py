from __future__ import annotations

import logging

from sqlalchemy import Engine, inspect, text
from sqlalchemy.schema import CreateColumn

from .models import Base

logger = logging.getLogger(__name__)


def sync_columns(engine: Engine) -> list[str]:
    """Add columns that the models declare but the database doesn't have yet.

    `create_all()` only ever creates missing *tables* — it never alters one
    that already exists. So adding a field to a model leaves the live SQLite
    file a column behind, and every insert then fails with an opaque 500.
    This closes that gap for the one case that keeps coming up while the
    schema is still moving: a newly added, nullable column.

    Deliberately narrow — dropped columns and changed types are left alone,
    since those need a human decision about what happens to existing rows.
    Returns the "table.column" names it added, for logging and tests.
    """
    added: list[str] = []
    inspector = inspect(engine)

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue  # create_all() builds this one from scratch

            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue

                # SQLite can't add a NOT NULL column to a populated table
                # without a DEFAULT in the DDL — that one genuinely needs a
                # migration.
                #
                # Only server_default counts here. A Python-side `default=` is
                # applied by SQLAlchemy at insert time and never appears in the
                # generated DDL, so a column like `status = mapped_column(
                # String(20), default="running")` compiles to a bare
                # `status VARCHAR(20) NOT NULL` — which SQLite rejects. Testing
                # `column.default` too would wave exactly those columns through
                # and blow up the ALTER below, and since this runs at startup
                # that takes the whole app down rather than one request.
                if not column.nullable and column.server_default is None:
                    logger.warning(
                        "schema_sync: skipping %s.%s — NOT NULL without a "
                        "server_default cannot be added to an existing table; "
                        "migrate it by hand",
                        table.name,
                        column.name,
                    )
                    continue

                ddl = CreateColumn(column).compile(dialect=engine.dialect)
                conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {ddl}"))
                added.append(f"{table.name}.{column.name}")

    if added:
        logger.info("schema_sync: added %d column(s): %s", len(added), ", ".join(added))
    return added
