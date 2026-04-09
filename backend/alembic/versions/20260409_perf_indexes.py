"""Indexes de performance : articles.edition_id, cluster_id, status

Revision ID: m20260409_perf_indexes
Revises: m20260401_planv2
Create Date: 2026-04-09

Indexes additifs uniquement — jamais de DROP.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "m20260409_perf_indexes"
down_revision: Union[str, None] = "m20260401_planv2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_articles_edition_id ON articles (edition_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_articles_cluster_id ON articles (cluster_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_articles_status ON articles (status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_articles_collected_at ON articles (collected_at);"
    )


def downgrade() -> None:
    # Ne pas supprimer en production — migrations additives uniquement.
    pass
