"""Vague pays : normalisation codes ISO2 et ensemble régional."""

from __future__ import annotations

from collections import defaultdict

from src.services.country_utils import (
    REGIONAL_COUNTRY_CODES,
    country_label_fr,
    normalize_country_code,
)


def test_normalize_country_code_upper_and_xx() -> None:
    assert normalize_country_code("lb") == "LB"
    assert normalize_country_code("") == "XX"
    assert normalize_country_code(None) == "XX"
    assert normalize_country_code("999") == "XX"


def test_regional_codes_contains_core_mena() -> None:
    assert "LB" in REGIONAL_COUNTRY_CODES
    assert "IL" in REGIONAL_COUNTRY_CODES
    assert "ME" in REGIONAL_COUNTRY_CODES


def test_by_country_merge_same_label() -> None:
    """Même logique que GET /api/stats : fusion des comptes par libellé FR."""
    counts_by_country_code = {"IL": 3, "FR": 1}
    merged: dict[str, int] = defaultdict(int)
    for code, cnt in counts_by_country_code.items():
        merged[country_label_fr(code)] += cnt
    assert merged[country_label_fr("IL")] == 3
    assert len(merged) == 2


def test_country_label_fr_xx() -> None:
    assert country_label_fr("XX") == "Inconnu"
