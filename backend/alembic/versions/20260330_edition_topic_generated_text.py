"""edition_topics.generated_text — génération revue par sujet (MEMW §6).

Revision ID: a1b2c3d4e5f7
Revises: f3a4b5c6d7e8
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from memw_alembic_utils import column_exists

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if column_exists("edition_topics", "generated_text"):
        return
    op.add_column(
        "edition_topics",
        sa.Column("generated_text", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    if not column_exists("edition_topics", "generated_text"):
        return
    op.drop_column("edition_topics", "generated_text")
