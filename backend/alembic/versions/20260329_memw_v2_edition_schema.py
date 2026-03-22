"""MEMW v2 — editions, edition_topics, pipeline_debug_logs, llm_call_logs, articles FK edition

Revision ID: f3a4b5c6d7e8
Revises: e1f2a3b4c5d6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return _insp().has_table(name)


def upgrade() -> None:
    if not _has_table("editions"):
        op.create_table(
            "editions",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("publish_date", sa.Date(), nullable=False),
            sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
            sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Asia/Beirut"),
            sa.Column("target_topics_min", sa.Integer(), nullable=False, server_default="4"),
            sa.Column("target_topics_max", sa.Integer(), nullable=False, server_default="8"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="SCHEDULED"),
            sa.Column("curator_run_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("pipeline_trace_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("generated_text", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("publish_date", name="uq_editions_publish_date"),
        )

    if not _has_table("edition_topics"):
        op.create_table(
            "edition_topics",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("edition_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("rank", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("title_proposed", sa.String(length=500), nullable=False),
            sa.Column("title_final", sa.String(length=500), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="proposed"),
            sa.Column("country_coverage", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("angle_summary", sa.Text(), nullable=True),
            sa.Column("dominant_angle", sa.Text(), nullable=True),
            sa.Column("counter_angle", sa.Text(), nullable=True),
            sa.Column("editorial_note", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(["edition_id"], ["editions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("edition_topic_articles"):
        op.create_table(
            "edition_topic_articles",
            sa.Column("edition_topic_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("article_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("is_recommended", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("is_selected", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("rank_in_topic", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["edition_topic_id"], ["edition_topics.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("edition_topic_id", "article_id"),
        )

    if not _has_table("pipeline_debug_logs"):
        op.create_table(
            "pipeline_debug_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("edition_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("step", sa.String(length=64), nullable=False),
            sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(["edition_id"], ["editions.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("llm_call_logs"):
        op.create_table(
            "llm_call_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("edition_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("prompt_id", sa.String(length=128), nullable=False),
            sa.Column("prompt_version", sa.String(length=32), nullable=False),
            sa.Column("model_used", sa.String(length=128), nullable=False),
            sa.Column("temperature", sa.Float(), nullable=False),
            sa.Column("input_tokens", sa.Integer(), nullable=True),
            sa.Column("output_tokens", sa.Integer(), nullable=True),
            sa.Column("latency_ms", sa.Integer(), nullable=True),
            sa.Column("cost_usd", sa.Float(), nullable=True),
            sa.Column("input_hash", sa.String(length=128), nullable=True),
            sa.Column("output_raw", sa.Text(), nullable=True),
            sa.Column("output_parsed", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("validation_errors", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(["edition_id"], ["editions.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )

    if _has_table("articles"):
        cols = {c["name"] for c in _insp().get_columns("articles")}
        if "edition_id" not in cols and _has_table("editions"):
            op.add_column(
                "articles",
                sa.Column("edition_id", postgresql.UUID(as_uuid=True), nullable=True),
            )
            op.create_foreign_key(
                "fk_articles_edition_id_editions",
                "articles",
                "editions",
                ["edition_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if "relevance_score" not in cols:
            op.add_column("articles", sa.Column("relevance_score", sa.Float(), nullable=True))
        if "syndication_group_size" not in cols:
            op.add_column(
                "articles",
                sa.Column("syndication_group_size", sa.Integer(), nullable=True),
            )
        if "syndication_group_sources" not in cols:
            op.add_column(
                "articles",
                sa.Column("syndication_group_sources", sa.JSON(), nullable=True),
            )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("articles"):
        return
    cols = {c["name"] for c in insp.get_columns("articles")}
    if "syndication_group_sources" in cols:
        op.drop_column("articles", "syndication_group_sources")
    if "syndication_group_size" in cols:
        op.drop_column("articles", "syndication_group_size")
    if "relevance_score" in cols:
        op.drop_column("articles", "relevance_score")
    if "edition_id" in cols:
        op.drop_constraint("fk_articles_edition_id_editions", "articles", type_="foreignkey")
        op.drop_column("articles", "edition_id")

    for t in ("llm_call_logs", "pipeline_debug_logs", "edition_topic_articles", "edition_topics", "editions"):
        if insp.has_table(t):
            op.drop_table(t)
