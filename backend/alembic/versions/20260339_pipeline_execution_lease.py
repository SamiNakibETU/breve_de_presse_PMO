"""Table pipeline_execution_lease (verrou distribué pipeline).

Revision ID: m20260339_ple
Revises: m20260338_pue
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m20260339_ple"
down_revision: Union[str, None] = "m20260338_pue"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pipeline_execution_lease",
        sa.Column("lease_key", sa.String(length=64), nullable=False),
        sa.Column("holder_id", sa.String(length=64), nullable=True),
        sa.Column("trigger_label", sa.Text(), nullable=True),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("lease_key"),
    )
    op.create_index(
        "ix_pipeline_execution_lease_expires_at",
        "pipeline_execution_lease",
        ["expires_at"],
        unique=False,
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_pipeline_debug_logs_step_created_at "
        "ON pipeline_debug_logs (step, created_at DESC)"
    )

    op.execute(
        """
        INSERT INTO pipeline_execution_lease (
            lease_key, holder_id, trigger_label,
            acquired_at, heartbeat_at, expires_at, updated_at
        )
        VALUES (
            'daily_pipeline', NULL, NULL,
            NULL, NULL, NOW() AT TIME ZONE 'utc', NOW() AT TIME ZONE 'utc'
        )
        ON CONFLICT (lease_key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_pipeline_debug_logs_step_created_at")
    op.drop_index(
        "ix_pipeline_execution_lease_expires_at",
        table_name="pipeline_execution_lease",
    )
    op.drop_table("pipeline_execution_lease")
