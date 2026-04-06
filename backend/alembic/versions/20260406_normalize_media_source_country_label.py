"""Aligne media_sources.country sur country_label_fr(country_code).

Revision ID: m20260406_country_label
Revises: m20260403_analysis_ver
Create Date: 2026-04-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from src.services.country_utils import country_label_fr, normalize_country_code

revision: str = "m20260406_country_label"
down_revision: Union[str, None] = "m20260403_analysis_ver"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, country_code FROM media_sources")
    ).fetchall()
    for rid, cc in rows:
        code = normalize_country_code(str(cc) if cc is not None else None)
        label = country_label_fr(code)
        bind.execute(
            sa.text("UPDATE media_sources SET country = :country WHERE id = :id"),
            {"country": label, "id": rid},
        )


def downgrade() -> None:
    # Pas de restauration des libellés hétérogènes historiques.
    pass
