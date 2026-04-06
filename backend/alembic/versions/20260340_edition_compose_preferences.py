"""editions: extra_selected_article_ids, compose_instructions_fr (UX rédaction)

Revision ID: m20260340_ecp
Revises: m20260339_ple
Create Date: 2026-03-30

Colonnes ajoutées avec IF NOT EXISTS : évite l'échec si le schéma a déjà été
aligné manuellement ou si une montée de version a été interrompue (ex. Railway).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m20260340_ecp"
down_revision: Union[str, None] = "m20260339_ple"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            ALTER TABLE editions
            ADD COLUMN IF NOT EXISTS extra_selected_article_ids JSONB
                NOT NULL DEFAULT '[]'::jsonb
            """
        )
    )
    op.execute(
        sa.text(
            """
            ALTER TABLE editions
            ADD COLUMN IF NOT EXISTS compose_instructions_fr TEXT
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("ALTER TABLE editions DROP COLUMN IF EXISTS compose_instructions_fr")
    )
    op.execute(
        sa.text("ALTER TABLE editions DROP COLUMN IF EXISTS extra_selected_article_ids")
    )
