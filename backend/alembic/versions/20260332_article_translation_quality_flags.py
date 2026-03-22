"""translation_quality_flags JSON (MEMW Partie E — quality_flags LLM)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260332_translation_quality_flags"
down_revision: Union[str, None] = "20260331_relevance_band"
branch_labels: Sequence[str] | None = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "articles",
        sa.Column("translation_quality_flags", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("articles", "translation_quality_flags")
