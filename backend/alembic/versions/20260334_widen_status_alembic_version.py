"""Widen articles.status (translation_abandoned=22ch) and alembic_version.version_num (≤255)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m20260334_wide"
down_revision: Union[str, None] = "20260333_dedup_feedback"
branch_labels: Sequence[str] | None = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # translation_abandoned (21) > VARCHAR(20) — provoquait des UPDATE en échec en prod
    op.alter_column(
        "articles",
        "status",
        existing_type=sa.String(length=20),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
    # Révisions Alembic longues échouaient sur VARCHAR(32) par défaut
    op.alter_column(
        "alembic_version",
        "version_num",
        existing_type=sa.String(length=32),
        type_=sa.String(length=255),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "alembic_version",
        "version_num",
        existing_type=sa.String(length=255),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
    op.alter_column(
        "articles",
        "status",
        existing_type=sa.String(length=64),
        type_=sa.String(length=20),
        existing_nullable=False,
    )
