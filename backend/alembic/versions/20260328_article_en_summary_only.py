"""articles.en_translation_summary_only (MEMW §2.2.6)

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("articles"):
        return
    cols = {c["name"] for c in insp.get_columns("articles")}
    if "en_translation_summary_only" not in cols:
        op.add_column(
            "articles",
            sa.Column(
                "en_translation_summary_only",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("articles"):
        return
    cols = {c["name"] for c in insp.get_columns("articles")}
    if "en_translation_summary_only" in cols:
        op.drop_column("articles", "en_translation_summary_only")
