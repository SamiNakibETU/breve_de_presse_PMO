"""add topic_clusters table and article embedding column

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "topic_clusters",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("label", sa.String(300)),
        sa.Column("article_count", sa.Integer(), server_default="0"),
        sa.Column("country_count", sa.Integer(), server_default="0"),
        sa.Column("avg_relevance", sa.Float(), server_default="0.0"),
        sa.Column("latest_article_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.add_column(
        "articles",
        sa.Column("embedding", Vector(1024), nullable=True),
    )
    op.add_column(
        "articles",
        sa.Column("cluster_id", sa.UUID(), sa.ForeignKey("topic_clusters.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("articles", "cluster_id")
    op.drop_column("articles", "embedding")
    op.drop_table("topic_clusters")
