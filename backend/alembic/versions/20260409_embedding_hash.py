"""Ajoute embedding_content_hash pour éviter re-embedding inutile."""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "m20260409_embedding_hash"
down_revision: Union[str, None] = "m20260409_article_images"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE articles ADD COLUMN IF NOT EXISTS embedding_content_hash VARCHAR(64);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_articles_embedding_content_hash "
        "ON articles (embedding_content_hash) WHERE embedding_content_hash IS NOT NULL;"
    )


def downgrade() -> None:
    pass
