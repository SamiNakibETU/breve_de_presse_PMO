"""Article editorial fields, edition detection_status, edition_topics LLM fields, pivot columns.

Revision ID: m20260335_memw_ed
Revises: m20260334_wide
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from memw_alembic_utils import column_exists

revision: str = "m20260335_memw_ed"
down_revision: Union[str, None] = "m20260334_wide"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not column_exists("articles", "editorial_angle"):
        op.add_column(
            "articles",
            sa.Column("editorial_angle", sa.String(length=300), nullable=True),
        )
    if not column_exists("articles", "event_tags"):
        op.add_column(
            "articles",
            sa.Column(
                "event_tags",
                postgresql.ARRAY(sa.String(length=100)),
                nullable=True,
            ),
        )
    if not column_exists("articles", "is_flagship"):
        op.add_column(
            "articles",
            sa.Column(
                "is_flagship",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )

    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_articles_editorial_angle "
            "ON articles (editorial_angle) WHERE editorial_angle IS NOT NULL"
        ),
    )

    if not column_exists("editions", "detection_status"):
        op.add_column(
            "editions",
            sa.Column(
                "detection_status",
                sa.String(length=20),
                nullable=False,
                server_default="pending",
            ),
        )

    if not column_exists("edition_topics", "angle_id"):
        op.add_column(
            "edition_topics",
            sa.Column("angle_id", sa.String(length=100), nullable=True),
        )
    if not column_exists("edition_topics", "development_description"):
        op.add_column(
            "edition_topics",
            sa.Column("development_description", sa.Text(), nullable=True),
        )
    if not column_exists("edition_topics", "is_multi_perspective"):
        op.add_column(
            "edition_topics",
            sa.Column(
                "is_multi_perspective",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )
    if not column_exists("edition_topics", "topic_country_codes"):
        op.add_column(
            "edition_topics",
            sa.Column(
                "topic_country_codes",
                postgresql.ARRAY(sa.String(length=10)),
                nullable=True,
            ),
        )

    if not column_exists("edition_topic_articles", "fit_confidence"):
        op.add_column(
            "edition_topic_articles",
            sa.Column("fit_confidence", sa.Float(), nullable=True),
        )
    if not column_exists("edition_topic_articles", "perspective_rarity"):
        op.add_column(
            "edition_topic_articles",
            sa.Column("perspective_rarity", sa.Integer(), nullable=True),
        )
    if not column_exists("edition_topic_articles", "display_order"):
        op.add_column(
            "edition_topic_articles",
            sa.Column("display_order", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    if column_exists("edition_topic_articles", "display_order"):
        op.drop_column("edition_topic_articles", "display_order")
    if column_exists("edition_topic_articles", "perspective_rarity"):
        op.drop_column("edition_topic_articles", "perspective_rarity")
    if column_exists("edition_topic_articles", "fit_confidence"):
        op.drop_column("edition_topic_articles", "fit_confidence")

    if column_exists("edition_topics", "topic_country_codes"):
        op.drop_column("edition_topics", "topic_country_codes")
    if column_exists("edition_topics", "is_multi_perspective"):
        op.drop_column("edition_topics", "is_multi_perspective")
    if column_exists("edition_topics", "development_description"):
        op.drop_column("edition_topics", "development_description")
    if column_exists("edition_topics", "angle_id"):
        op.drop_column("edition_topics", "angle_id")

    if column_exists("editions", "detection_status"):
        op.drop_column("editions", "detection_status")

    op.execute(sa.text("DROP INDEX IF EXISTS ix_articles_editorial_angle"))
    if column_exists("articles", "is_flagship"):
        op.drop_column("articles", "is_flagship")
    if column_exists("articles", "event_tags"):
        op.drop_column("articles", "event_tags")
    if column_exists("articles", "editorial_angle"):
        op.drop_column("articles", "editorial_angle")
