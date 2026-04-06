"""Plan v2 : analyse article, rétention, meta scraper, user_rank sujets

Revision ID: m20260401_planv2
Revises: m20260340_ecp
Create Date: 2026-04-01

Colonnes et index créés avec IF NOT EXISTS : évite l'échec si le schéma a déjà
été aligné manuellement ou si une montée de version a été interrompue (ex. Railway).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m20260401_planv2"
down_revision: Union[str, None] = "m20260340_ecp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # articles — analyse, rétention, méta scrape
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS analysis_bullets_fr JSONB"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_thesis_explicit_fr TEXT"
        )
    )
    op.execute(
        sa.text("ALTER TABLE articles ADD COLUMN IF NOT EXISTS factual_context_fr TEXT")
    )
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS analysis_tone VARCHAR(32)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS fact_opinion_quality VARCHAR(32)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS analysis_version VARCHAR(16)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS retention_reason VARCHAR(64)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS scrape_method VARCHAR(32)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS scrape_cascade_attempts INTEGER"
        )
    )

    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS ix_articles_retention_active
            ON articles (retention_until)
            WHERE retention_until IS NOT NULL
            """
        )
    )

    op.execute(
        sa.text(
            "ALTER TABLE edition_topics ADD COLUMN IF NOT EXISTS user_rank INTEGER"
        )
    )


def downgrade() -> None:
    """Politique projet : migrations additives uniquement — pas de DROP en prod."""
    pass
