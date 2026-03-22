"""translation_quality_flags JSON (MEMW Partie E — quality_flags LLM)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from memw_alembic_utils import column_exists

# ≤32 car. : alembic_version.version_num est souvent VARCHAR(32) (nom long = échec UPDATE).
revision: str = "m20260332_tqf"
down_revision: Union[str, None] = "20260331_relevance_band"
branch_labels: Sequence[str] | None = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if column_exists("articles", "translation_quality_flags"):
        return
    op.add_column(
        "articles",
        sa.Column("translation_quality_flags", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    if not column_exists("articles", "translation_quality_flags"):
        return
    op.drop_column("articles", "translation_quality_flags")
