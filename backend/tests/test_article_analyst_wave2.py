"""Vague 2 : priorité batch analyse (bande × type éditorial)."""

from __future__ import annotations

from src.services.article_analysis_priority import analysis_priority_sort_key


def test_band_order_high_before_medium_before_low() -> None:
    assert analysis_priority_sort_key("high", None) < analysis_priority_sort_key("medium", None)
    assert analysis_priority_sort_key("medium", "news") < analysis_priority_sort_key("low", "news")
    assert analysis_priority_sort_key("low", None) < analysis_priority_sort_key(None, None)


def test_editorial_type_before_other_same_band() -> None:
    assert analysis_priority_sort_key("high", "opinion") < analysis_priority_sort_key("high", "news")
    assert analysis_priority_sort_key("medium", "editorial") < analysis_priority_sort_key("medium", None)
    assert analysis_priority_sort_key("low", "tribune") < analysis_priority_sort_key("low", "brief")
    # Même bande, deux types éditoriaux : même clé secondaire
    assert analysis_priority_sort_key("high", "opinion") == analysis_priority_sort_key("high", "editorial")


def test_case_insensitive_article_type() -> None:
    assert analysis_priority_sort_key("high", "Opinion") == analysis_priority_sort_key("high", "opinion")
    assert analysis_priority_sort_key("high", "ANALYSIS") == analysis_priority_sort_key("high", "analysis")
