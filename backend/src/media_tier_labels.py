"""Convention MEMW §8 : tiers P0–P2 (entier 0–2 en base)."""

from __future__ import annotations


def tier_band(tier: int | None) -> str:
    """Libellé éditorial pour l’API (pas une colonne SQL)."""
    if tier is None:
        return "P?"
    if tier <= 0:
        return "P0"
    if tier == 1:
        return "P1"
    return "P2"
