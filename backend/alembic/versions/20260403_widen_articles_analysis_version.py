"""Élargit articles.analysis_version pour les identifiants de version (ex. article_analysis_v1).

Revision ID: m20260403_analysis_ver
Revises: m20260402_msid_norm
Create Date: 2026-04-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m20260403_analysis_ver"
down_revision: Union[str, None] = "m20260402_msid_norm"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "articles",
        "analysis_version",
        existing_type=sa.String(length=16),
        type_=sa.String(length=64),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "articles",
        "analysis_version",
        existing_type=sa.String(length=64),
        type_=sa.String(length=16),
        existing_nullable=True,
    )
