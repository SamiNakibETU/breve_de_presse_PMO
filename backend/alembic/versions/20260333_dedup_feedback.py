"""dedup_feedback — signalement faux positifs dédup (MEMW P3)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260333_dedup_feedback"
down_revision: Union[str, None] = "20260332_translation_quality_flags"
branch_labels: Sequence[str] | None = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dedup_feedback",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("article_id", sa.UUID(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("dedup_feedback")
