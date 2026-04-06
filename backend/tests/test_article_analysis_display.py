"""Affichage état analyse experte (champs dérivés)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from src.models.article import Article
from src.services.article_analysis_display import compute_article_analysis_display


def _minimal_article(**kwargs: object) -> Article:
    base = dict(
        id=uuid.uuid4(),
        media_source_id="ms_test",
        url="https://example.com/a",
        url_hash="hash_a",
        title_original="Titre",
    )
    base.update(kwargs)
    return Article(**base)


def test_skipped_out_of_scope() -> None:
    a = _minimal_article(relevance_band="out_of_scope", summary_fr="Résumé")
    st, hint = compute_article_analysis_display(a)
    assert st == "skipped_out_of_scope"
    assert hint and "périmètre" in hint.lower()


def test_skipped_no_summary() -> None:
    a = _minimal_article(relevance_band="high", summary_fr=None)
    st, hint = compute_article_analysis_display(a)
    assert st == "skipped_no_summary"


def test_complete_with_bullets() -> None:
    a = _minimal_article(
        relevance_band="high",
        summary_fr="S",
        analyzed_at=datetime.now(timezone.utc),
        analysis_bullets_fr=["Une idée"],
    )
    st, hint = compute_article_analysis_display(a)
    assert st == "complete"
    assert hint is None


def test_pending_not_analyzed() -> None:
    a = _minimal_article(relevance_band="high", summary_fr="S", analyzed_at=None)
    st, hint = compute_article_analysis_display(a)
    assert st == "pending"
    assert hint and "attente" in hint.lower()
