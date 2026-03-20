"""Article: framing_actor, framing_tone, framing_prescription, content_translated_fr

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("articles"):
        return
    cols = {c["name"] for c in insp.get_columns("articles")}
    if "framing_actor" not in cols:
        op.add_column("articles", sa.Column("framing_actor", sa.String(500), nullable=True))
    if "framing_tone" not in cols:
        op.add_column("articles", sa.Column("framing_tone", sa.String(120), nullable=True))
    if "framing_prescription" not in cols:
        op.add_column("articles", sa.Column("framing_prescription", sa.Text(), nullable=True))
    if "content_translated_fr" not in cols:
        op.add_column("articles", sa.Column("content_translated_fr", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("articles"):
        return
    cols = {c["name"] for c in insp.get_columns("articles")}
    for name in (
        "content_translated_fr",
        "framing_prescription",
        "framing_tone",
        "framing_actor",
    ):
        if name in cols:
            op.drop_column("articles", name)
