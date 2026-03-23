"""Helpers pour migrations idempotentes (schéma déjà partiellement appliqué sur certains déplois)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


def column_exists(table: str, column: str) -> bool:
    """PostgreSQL : information_schema (fiable avec sync Alembic + asyncpg dialect)."""
    bind = op.get_bind()
    row = bind.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table_name
                  AND column_name = :column_name
            )
            """
        ),
        {"table_name": table, "column_name": column},
    ).scalar()
    return bool(row)


def table_exists(name: str) -> bool:
    bind = op.get_bind()
    row = bind.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = :table_name
            )
            """
        ),
        {"table_name": name},
    ).scalar()
    return bool(row)
