"""Filtre revue de presse : lifestyle vs signal géopolitique."""

from src.services.editorial_scope import (
    has_geopolitical_relevance_signal,
    is_out_of_scope_lifestyle,
    should_ingest_rss_entry,
    should_ingest_scraped_article,
)


def test_lifestyle_turkey_travel_rejected():
    assert is_out_of_scope_lifestyle("Voyage et cuisine en Turquie et Asie")
    assert not should_ingest_rss_entry(
        "Voyage et cuisine en Turquie",
        "",
        uses_opinion_feed=True,
    )
    assert not should_ingest_scraped_article(
        "Best restaurants in Istanbul",
        "A guide to Turkish cuisine and hotels",
    )


def test_opinion_feed_still_requires_geopolitics_for_generic_rss_false():
    # Flux non-opinion : pays seul insuffisant
    assert not has_geopolitical_relevance_signal(
        "Amazing week in Qatar resorts",
        "Spa and beaches",
    )


def test_geopolitical_signal_gaza():
    assert has_geopolitical_relevance_signal(
        "Gaza ceasefire talks stall",
        "Diplomats meet in Doha",
    )


def test_war_not_award_false_positive():
    assert not has_geopolitical_relevance_signal(
        "Film wins award at Cannes",
        "Best director prize",
    )


def test_opinion_feed_allows_geopolitical():
    assert should_ingest_rss_entry(
        "Iran nuclear program concerns",
        "IAEA report summary",
        uses_opinion_feed=True,
    )
