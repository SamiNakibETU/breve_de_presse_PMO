"""Table provider_usage_events (ledger coûts unifié).

Revision ID: m20260338_pue
Revises: m20260337_usage
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from memw_alembic_utils import table_exists

revision: str = "m20260338_pue"
down_revision: Union[str, None] = "m20260337_usage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not table_exists("provider_usage_events"):
        op.create_table(
            "provider_usage_events",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("provider", sa.String(length=32), nullable=False),
            sa.Column("model", sa.String(length=160), nullable=False),
            sa.Column("operation", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="ok"),
            sa.Column("input_units", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("output_units", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cost_usd_est", sa.Float(), nullable=False, server_default="0"),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("edition_id", sa.UUID(), nullable=True),
            sa.Column("article_id", sa.UUID(), nullable=True),
            sa.Column("edition_topic_id", sa.UUID(), nullable=True),
            sa.Column("meta_json", JSONB(), nullable=True),
            sa.ForeignKeyConstraint(
                ["edition_id"],
                ["editions.id"],
                ondelete="SET NULL",
            ),
            sa.ForeignKeyConstraint(
                ["article_id"],
                ["articles.id"],
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
            "ix_provider_usage_events_created_at",
            "provider_usage_events",
            ["created_at"],
            unique=False,
        )
        op.create_index(
            "ix_provider_usage_events_operation",
            "provider_usage_events",
            ["operation"],
            unique=False,
        )
        op.create_index(
            "ix_provider_usage_events_provider",
            "provider_usage_events",
            ["provider"],
            unique=False,
        )


def downgrade() -> None:
    if table_exists("provider_usage_events"):
        op.drop_index("ix_provider_usage_events_provider", table_name="provider_usage_events")
        op.drop_index("ix_provider_usage_events_operation", table_name="provider_usage_events")
        op.drop_index("ix_provider_usage_events_created_at", table_name="provider_usage_events")
        op.drop_table("provider_usage_events")
