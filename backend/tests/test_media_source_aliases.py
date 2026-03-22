"""Registre d'alias media_source_id."""

from src.services.media_source_aliases import equivalent_media_source_ids


def test_equivalent_unknown_returns_singleton():
    assert equivalent_media_source_ids("zz_unknown_xyz") == ["zz_unknown_xyz"]


def test_equivalent_merges_configured_group():
    g = equivalent_media_source_ids("tr_daily_sabah")
    assert "tr_daily_sabah" in g
    assert "tr_dailysabah" in g
    assert len(g) == 2
    assert equivalent_media_source_ids("tr_dailysabah") == g
