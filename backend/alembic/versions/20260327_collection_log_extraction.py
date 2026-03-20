"""collection_logs: métriques extraction (MEMW §2.1.6)

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("collection_logs"):
        return
    cols = {c["name"] for c in insp.get_columns("collection_logs")}
    if "extraction_attempts" not in cols:
        op.add_column(
            "collection_logs",
            sa.Column(
                "extraction_attempts",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
    if "extraction_primary_success" not in cols:
        op.add_column(
            "collection_logs",
            sa.Column(
                "extraction_primary_success",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("collection_logs"):
        return
    cols = {c["name"] for c in insp.get_columns("collection_logs")}
    for name in ("extraction_primary_success", "extraction_attempts"):
        if name in cols:
            op.drop_column("collection_logs", name)
