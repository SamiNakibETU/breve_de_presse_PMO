"""usage_events + llm_call_logs.provider (dashboard analytique).

Revision ID: m20260337_usage
Revises: m20260336_rel_det
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from memw_alembic_utils import column_exists, table_exists

revision: str = "m20260337_usage"
down_revision: Union[str, None] = "m20260336_rel_det"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not table_exists("usage_events"):
        op.create_table(
            "usage_events",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("method", sa.String(length=8), nullable=False),
            sa.Column("path", sa.String(length=512), nullable=False),
            sa.Column("path_template", sa.String(length=512), nullable=False),
            sa.Column("status_code", sa.Integer(), nullable=False),
            sa.Column("duration_ms", sa.Integer(), nullable=False),
            sa.Column("edition_id", sa.UUID(), nullable=True),
            sa.Column("edition_topic_id", sa.UUID(), nullable=True),
            sa.Column("editor_id", sa.String(length=128), nullable=True),
            sa.ForeignKeyConstraint(
                ["edition_id"],
                ["editions.id"],
                ondelete="SET NULL",
            ),
            sa.ForeignKeyConstraint(
                ["edition_topic_id"],
                ["edition_topics.id"],
                ondelete="SET NULL",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_usage_events_created_at",
            "usage_events",
            ["created_at"],
            unique=False,
        )
        op.create_index(
            "ix_usage_events_path_template",
            "usage_events",
            ["path_template"],
            unique=False,
        )

    if not column_exists("llm_call_logs", "provider"):
        op.add_column(
            "llm_call_logs",
            sa.Column("provider", sa.String(length=32), nullable=True),
        )


def downgrade() -> None:
    if column_exists("llm_call_logs", "provider"):
        op.drop_column("llm_call_logs", "provider")
    if table_exists("usage_events"):
        op.drop_index("ix_usage_events_path_template", table_name="usage_events")
        op.drop_index("ix_usage_events_created_at", table_name="usage_events")
        op.drop_table("usage_events")
