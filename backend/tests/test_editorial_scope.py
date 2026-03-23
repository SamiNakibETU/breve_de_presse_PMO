"""Filtre revue de presse : lifestyle vs signal géopolitique."""

from src.services.clustering_service import EDITORIAL_CLUSTER_TYPES
from src.services.editorial_scope import (
    has_geopolitical_relevance_signal,
    is_article_eligible_for_clustering,
    is_out_of_scope_lifestyle,
    should_ingest_rss_entry,
    should_ingest_scraped_article,
)


def test_leisure_super_lig_rejected():
    assert is_out_of_scope_lifestyle("Galatasaray super lig match report and standings")


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


def test_leisure_sport_and_obituary_marked_lifestyle():
    assert is_out_of_scope_lifestyle("Euroleague finals recap and standings")
    assert is_out_of_scope_lifestyle("In memoriam: a tribute to the poet")
    assert is_out_of_scope_lifestyle("Obituary: former minister dies at 88")


def test_opinion_feed_allows_geopolitical():
    assert should_ingest_rss_entry(
        "Iran nuclear program concerns",
        "IAEA report summary",
        uses_opinion_feed=True,
    )


def test_clustering_excludes_relevance_out_of_scope():
    assert not is_article_eligible_for_clustering(
        "Kafka au cinéma",
        "Kafka au cinéma",
        "Festival",
        "analysis",
        EDITORIAL_CLUSTER_TYPES,
        True,
        relevance_score=0.12,
        relevance_band="out_of_scope",
    )


def test_clustering_excludes_score_below_threshold_even_if_band_low():
    assert not is_article_eligible_for_clustering(
        "Sport",
        "Sport",
        "Match",
        "analysis",
        EDITORIAL_CLUSTER_TYPES,
        True,
        relevance_score=0.25,
        relevance_band="low",
    )


def test_clustering_accepts_geopolitical_relevance():
    assert is_article_eligible_for_clustering(
        "Frappes sur l'Iran",
        "Strikes on Iran",
        "Escalade régionale",
        "analysis",
        EDITORIAL_CLUSTER_TYPES,
        True,
        relevance_score=0.82,
        relevance_band="high",
    )
