"""Helpers pour migrations idempotentes (schéma déjà partiellement appliqué sur certains déplois)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


def column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def table_exists(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)
