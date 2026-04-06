"""
Priorité des candidats pour le batch d'analyse experte (aligné sur le CASE SQL).
"""

from __future__ import annotations

from src.services.editorial_article_types import EDITORIAL_CLUSTER_TYPES

EDITORIAL_TYPES_SQL_TUPLE = tuple(sorted(EDITORIAL_CLUSTER_TYPES))


def analysis_priority_sort_key(
    relevance_band: str | None,
    article_type: str | None,
) -> tuple[int, int]:
    """
    Ordre de priorité (bande puis type), sans tie-break date — doit rester cohérent
    avec ``_band_order_case`` / ``_editorial_type_order_case`` dans ``article_analyst``.
    """
    b = (relevance_band or "").strip().lower()
    if b == "high":
        br = 0
    elif b == "medium":
        br = 1
    elif b == "low":
        br = 2
    else:
        br = 3
    t = (article_type or "").strip().lower()
    tr = 0 if t in EDITORIAL_CLUSTER_TYPES else 1
    return (br, tr)
