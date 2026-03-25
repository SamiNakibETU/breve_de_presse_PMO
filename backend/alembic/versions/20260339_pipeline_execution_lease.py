"""Table pipeline_execution_lease (verrou distribué pipeline).

Revision ID: m20260339_ple
Revises: m20260338_pue
"""

from typing import Sequence, Union

from alembic import op

revision: str = "m20260339_ple"
down_revision: Union[str, None] = "m20260338_pue"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Idempotent : ``init_db()`` / ``create_all`` peut avoir créé la table avant Alembic
    (déploiement sans migration jouée), d’où ``IF NOT EXISTS``.
    """
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS pipeline_execution_lease (
            lease_key VARCHAR(64) NOT NULL,
            holder_id VARCHAR(64),
            trigger_label TEXT,
            acquired_at TIMESTAMP WITH TIME ZONE,
            heartbeat_at TIMESTAMP WITH TIME ZONE,
            expires_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
            PRIMARY KEY (lease_key)
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_pipeline_execution_lease_expires_at "
        "ON pipeline_execution_lease (expires_at);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_pipeline_debug_logs_step_created_at "
        "ON pipeline_debug_logs (step, created_at DESC);"
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
        ON CONFLICT (lease_key) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_pipeline_debug_logs_step_created_at")
    op.drop_index(
        "ix_pipeline_execution_lease_expires_at",
        table_name="pipeline_execution_lease",
    )
    op.drop_table("pipeline_execution_lease")
