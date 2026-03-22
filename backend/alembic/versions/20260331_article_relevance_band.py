"""article relevance_band for Prompt 5 gating (MEMW sprint 2)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from memw_alembic_utils import column_exists

revision: str = "20260331_relevance_band"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Sequence[str] | None = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if column_exists("articles", "relevance_band"):
        return
    op.add_column(
        "articles",
        sa.Column("relevance_band", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    if not column_exists("articles", "relevance_band"):
        return
    op.drop_column("articles", "relevance_band")
