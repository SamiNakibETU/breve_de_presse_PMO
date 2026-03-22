"""edition_topics.generated_text — génération revue par sujet (MEMW §6).

Revision ID: a1b2c3d4e5f7
Revises: f3a4b5c6d7e8
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "edition_topics",
        sa.Column("generated_text", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("edition_topics", "generated_text")
