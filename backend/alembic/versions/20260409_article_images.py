"""Articles : ajouter image_url et image_caption

Revision ID: m20260409_article_images
Revises: m20260409_perf_indexes
Create Date: 2026-04-09

Migration additive uniquement — pas de DROP.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m20260409_article_images"
down_revision: Union[str, None] = "m20260409_perf_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_url VARCHAR(2000);"
    )
    op.execute(
        "ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_caption VARCHAR(500);"
    )


def downgrade() -> None:
    # Migrations additives uniquement — pas de suppression en production.
    pass
