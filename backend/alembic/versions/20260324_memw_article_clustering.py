"""MEMW: cluster_soft_assigned, framing_json, syndication columns on articles

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-03-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    bind = op.get_bind()
    return sa.inspect(bind)


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _insp().get_columns(table)}


def upgrade() -> None:
    if not _insp().has_table("articles"):
        return

    if not _has_column("articles", "cluster_soft_assigned"):
        op.add_column(
            "articles",
            sa.Column(
                "cluster_soft_assigned",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )

    if not _has_column("articles", "framing_json"):
        op.add_column(
            "articles",
            sa.Column("framing_json", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        )

    if not _has_column("articles", "is_syndicated"):
        op.add_column(
            "articles",
            sa.Column(
                "is_syndicated",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )

    if not _has_column("articles", "canonical_article_id"):
        op.add_column(
            "articles",
            sa.Column(
                "canonical_article_id",
                postgresql.UUID(as_uuid=True),
                nullable=True,
            ),
        )
        op.create_foreign_key(
            "fk_articles_canonical_article_id",
            "articles",
            "articles",
            ["canonical_article_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    if not _insp().has_table("articles"):
        return

    if _has_column("articles", "canonical_article_id"):
        op.drop_constraint("fk_articles_canonical_article_id", "articles", type_="foreignkey")
        op.drop_column("articles", "canonical_article_id")

    for col in ("is_syndicated", "framing_json", "cluster_soft_assigned"):
        if _has_column("articles", col):
            op.drop_column("articles", col)
