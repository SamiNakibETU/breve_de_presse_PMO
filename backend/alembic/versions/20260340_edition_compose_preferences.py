"""editions: extra_selected_article_ids, compose_instructions_fr (UX rédaction)

Revision ID: m20260340_ecp
Revises: m20260339_ple
Create Date: 2026-03-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m20260340_ecp"
down_revision: Union[str, None] = "m20260339_ple"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "editions",
        sa.Column(
            "extra_selected_article_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "editions",
        sa.Column("compose_instructions_fr", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("editions", "compose_instructions_fr")
    op.drop_column("editions", "extra_selected_article_ids")
