"""Normalise les media_source_id alias vers les IDs du registre MEMW.

Revision ID: m20260402_msid_norm
Revises: m20260401_planv2
Create Date: 2026-04-02

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "m20260402_msid_norm"
down_revision: Union[str, None] = "m20260401_planv2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (alias_id, canonical_id registre MEDIA_REVUE_REGISTRY.json)
_ALIAS_TO_CANONICAL: tuple[tuple[str, str], ...] = (
    ("tr_dailysabah", "tr_daily_sabah"),
    ("ae_gulfnews", "ae_gulf_news"),
    ("qa_gulftimes", "qa_gulf_times"),
    ("kw_kuwaittimes", "kw_kuwait_times"),
    ("sy_enabbaladi", "sy_enab_baladi"),
    ("int_middleeasteye", "me_middle_east_eye"),
    ("ir_iranintl", "ir_iran_international"),
    ("eg_madamasr", "eg_madam_masr"),
    ("jo_jordantimes", "jo_jordan_times"),
    ("il_toi", "il_the_times_of_israel"),
    ("il_timesofisrael", "il_the_times_of_israel"),
    ("qa_perinsula", "qa_the_peninsula"),
    ("sa_saudigazette", "sa_saudi_gazette"),
    ("il_haaretz_en", "il_haaretz"),
    ("il_jpost", "il_jerusalem_post"),
)


def upgrade() -> None:
    bind = op.get_bind()
    for alias_id, canonical_id in _ALIAS_TO_CANONICAL:
        bind.execute(
            text(
                """
                UPDATE articles
                SET media_source_id = :canonical
                WHERE media_source_id = :alias
                  AND EXISTS (SELECT 1 FROM media_sources m WHERE m.id = :canonical)
                """
            ),
            {"alias": alias_id, "canonical": canonical_id},
        )
        bind.execute(
            text(
                """
                UPDATE collection_logs
                SET media_source_id = :canonical
                WHERE media_source_id = :alias
                  AND EXISTS (SELECT 1 FROM media_sources m WHERE m.id = :canonical)
                """
            ),
            {"alias": alias_id, "canonical": canonical_id},
        )


def downgrade() -> None:
    # Pas de retour arrière fiable (perte de l’information « ancien alias »).
    pass
