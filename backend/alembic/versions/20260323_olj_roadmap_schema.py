"""OLJ roadmap: editorial_events, article enrichment, saved_searches, translation_reviews, review versioning, HNSW index

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-03-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "topic_clusters",
        sa.Column("insight_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.create_table(
        "editorial_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_label_fr", sa.String(length=500), nullable=False),
        sa.Column("slug", sa.String(length=200), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
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
        sa.UniqueConstraint("slug"),
    )

    op.add_column(
        "articles",
        sa.Column(
            "olj_topic_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column("articles", sa.Column("article_family", sa.String(length=30), nullable=True))
    op.add_column(
        "articles",
        sa.Column(
            "paywall_observed",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "articles",
        sa.Column("published_at_source", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "articles",
        sa.Column("dedupe_group_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "articles",
        sa.Column("primary_editorial_event_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("articles", sa.Column("stance_summary", sa.Text(), nullable=True))
    op.add_column(
        "articles",
        sa.Column("event_extraction_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "articles",
        sa.Column("source_spans_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_foreign_key(
        "fk_articles_primary_editorial_event",
        "articles",
        "editorial_events",
        ["primary_editorial_event_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_articles_primary_editorial_event_id",
        "articles",
        ["primary_editorial_event_id"],
    )
    op.create_index("ix_articles_dedupe_group_id", "articles", ["dedupe_group_id"])

    op.create_table(
        "saved_searches",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("filters_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("owner", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "translation_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("article_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("reviewer", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["article_id"],
            ["articles.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_translation_reviews_article_id",
        "translation_reviews",
        ["article_id"],
    )

    op.add_column(
        "reviews",
        sa.Column("supersedes_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("reviews", sa.Column("content_snapshot_hash", sa.String(length=64), nullable=True))
    op.add_column(
        "reviews",
        sa.Column("generation_prompt_hash", sa.String(length=64), nullable=True),
    )
    op.create_foreign_key(
        "fk_reviews_supersedes_id",
        "reviews",
        "reviews",
        ["supersedes_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_articles_embedding_hnsw
        ON articles USING hnsw (embedding vector_cosine_ops)
        WHERE embedding IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("topic_clusters", "insight_metadata")

    op.execute("DROP INDEX IF EXISTS ix_articles_embedding_hnsw")
    op.drop_constraint("fk_reviews_supersedes_id", "reviews", type_="foreignkey")
    op.drop_column("reviews", "generation_prompt_hash")
    op.drop_column("reviews", "content_snapshot_hash")
    op.drop_column("reviews", "supersedes_id")

    op.drop_index("ix_translation_reviews_article_id", table_name="translation_reviews")
    op.drop_table("translation_reviews")

    op.drop_table("saved_searches")

    op.drop_index("ix_articles_dedupe_group_id", table_name="articles")
    op.drop_index("ix_articles_primary_editorial_event_id", table_name="articles")
    op.drop_constraint("fk_articles_primary_editorial_event", "articles", type_="foreignkey")
    op.drop_column("articles", "source_spans_json")
    op.drop_column("articles", "event_extraction_json")
    op.drop_column("articles", "stance_summary")
    op.drop_column("articles", "primary_editorial_event_id")
    op.drop_column("articles", "dedupe_group_id")
    op.drop_column("articles", "published_at_source")
    op.drop_column("articles", "paywall_observed")
    op.drop_column("articles", "article_family")
    op.drop_column("articles", "olj_topic_ids")

    op.drop_table("editorial_events")
