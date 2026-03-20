"""MEMW: santé sources persistée, métriques collecte, analytics sélection revue

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("media_sources"):
        cols = {c["name"] for c in insp.get_columns("media_sources")}
        if "health_status" not in cols:
            op.add_column(
                "media_sources",
                sa.Column("health_status", sa.String(20), nullable=True),
            )
        if "consecutive_empty_collection_runs" not in cols:
            op.add_column(
                "media_sources",
                sa.Column(
                    "consecutive_empty_collection_runs",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                ),
            )
        if "last_article_ingested_at" not in cols:
            op.add_column(
                "media_sources",
                sa.Column(
                    "last_article_ingested_at",
                    sa.DateTime(timezone=True),
                    nullable=True,
                ),
            )
        if "health_metrics_json" not in cols:
            op.add_column(
                "media_sources",
                sa.Column("health_metrics_json", JSONB(), nullable=True),
            )

    if insp.has_table("collection_logs"):
        cols = {c["name"] for c in insp.get_columns("collection_logs")}
        if "duration_seconds" not in cols:
            op.add_column(
                "collection_logs",
                sa.Column("duration_seconds", sa.Integer(), nullable=True),
            )
        if "articles_filtered" not in cols:
            op.add_column(
                "collection_logs",
                sa.Column("articles_filtered", sa.Integer(), nullable=True),
            )

    if not insp.has_table("review_selection_events"):
        op.create_table(
            "review_selection_events",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("editor_id", sa.String(200), nullable=True),
            sa.Column("article_ids", JSONB(), nullable=False),
            sa.Column("country_codes", JSONB(), nullable=True),
            sa.Column("review_id", UUID(as_uuid=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("review_selection_events"):
        op.drop_table("review_selection_events")
    if insp.has_table("collection_logs"):
        cols = {c["name"] for c in insp.get_columns("collection_logs")}
        if "articles_filtered" in cols:
            op.drop_column("collection_logs", "articles_filtered")
        if "duration_seconds" in cols:
            op.drop_column("collection_logs", "duration_seconds")
    if insp.has_table("media_sources"):
        for col in (
            "health_metrics_json",
            "last_article_ingested_at",
            "consecutive_empty_collection_runs",
            "health_status",
        ):
            cols = {c["name"] for c in insp.get_columns("media_sources")}
            if col in cols:
                op.drop_column("media_sources", col)
