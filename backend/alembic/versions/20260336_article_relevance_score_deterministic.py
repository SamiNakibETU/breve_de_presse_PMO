"""Add articles.relevance_score_deterministic (score 0-1 avant scoring LLM).

Revision ID: m20260336_rel_det
Revises: m20260335_memw_ed
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from memw_alembic_utils import column_exists

revision: str = "m20260336_rel_det"
down_revision: Union[str, None] = "m20260335_memw_ed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not column_exists("articles", "relevance_score_deterministic"):
        op.add_column(
            "articles",
            sa.Column("relevance_score_deterministic", sa.Float(), nullable=True),
        )


def downgrade() -> None:
    if column_exists("articles", "relevance_score_deterministic"):
        op.drop_column("articles", "relevance_score_deterministic")
