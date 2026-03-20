"""indexes articles + pipeline_jobs, backfill translation_failure_count

Revision ID: e5f6a7b8c9d0
Revises: c3d4e5f6a7b8
Create Date: 2026-03-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE articles SET translation_failure_count = 0 "
            "WHERE translation_failure_count IS NULL",
        ),
    )
    op.create_index(
        "ix_articles_status_collected_at",
        "articles",
        ["status", "collected_at"],
    )
    op.create_index(
        "ix_articles_translation_failure_count",
        "articles",
        ["translation_failure_count"],
    )
    op.create_index(
        "ix_pipeline_jobs_status_created_at",
        "pipeline_jobs",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_pipeline_jobs_status_created_at", table_name="pipeline_jobs")
    op.drop_index("ix_articles_translation_failure_count", table_name="articles")
    op.drop_index("ix_articles_status_collected_at", table_name="articles")
