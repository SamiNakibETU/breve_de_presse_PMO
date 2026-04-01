"""Plan v2 : analyse article, rétention, meta scraper, user_rank sujets

Revision ID: m20260401_planv2
Revises: m20260340_ecp
Create Date: 2026-04-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m20260401_planv2"
down_revision: Union[str, None] = "m20260340_ecp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "articles",
        sa.Column(
            "analysis_bullets_fr",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column("articles", sa.Column("author_thesis_explicit_fr", sa.Text(), nullable=True))
    op.add_column("articles", sa.Column("factual_context_fr", sa.Text(), nullable=True))
    op.add_column("articles", sa.Column("analysis_tone", sa.String(length=32), nullable=True))
    op.add_column(
        "articles",
        sa.Column("fact_opinion_quality", sa.String(length=32), nullable=True),
    )
    op.add_column("articles", sa.Column("analysis_version", sa.String(length=16), nullable=True))
    op.add_column(
        "articles",
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "articles",
        sa.Column("retention_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "articles",
        sa.Column("retention_reason", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "articles",
        sa.Column("scrape_method", sa.String(length=32), nullable=True),
    )
    op.add_column("articles", sa.Column("scrape_cascade_attempts", sa.Integer(), nullable=True))

    op.create_index(
        "ix_articles_retention_active",
        "articles",
        ["retention_until"],
        postgresql_where=sa.text("retention_until IS NOT NULL"),
    )

    op.add_column(
        "edition_topics",
        sa.Column("user_rank", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Politique projet : migrations additives uniquement — pas de DROP en prod."""
    pass
