"""
État d’affichage de l’analyse experte (dérivé des champs article, sans requête extra).
"""

from __future__ import annotations

from typing import Literal

from src.models.article import Article

AnalysisDisplayState = Literal[
    "complete",
    "pending",
    "skipped_no_summary",
    "skipped_out_of_scope",
]


def compute_article_analysis_display(art: Article) -> tuple[AnalysisDisplayState, str | None]:
    """
    Retourne (état, hint FR optionnel pour badge / tooltip).
    """
    band = (art.relevance_band or "").strip().lower()
    if band == "out_of_scope":
        return (
            "skipped_out_of_scope",
            "Hors périmètre éditorial — pas d’analyse experte.",
        )
    if not (art.summary_fr or "").strip():
        return (
            "skipped_no_summary",
            "Pas de résumé FR — l’analyse n’est pas applicable.",
        )

    bullets = getattr(art, "analysis_bullets_fr", None)
    has_structured = bool(
        (isinstance(bullets, list) and len(bullets) > 0)
        or (getattr(art, "author_thesis_explicit_fr", None) or "").strip()
        or (getattr(art, "factual_context_fr", None) or "").strip()
    )
    if getattr(art, "analyzed_at", None) is not None and has_structured:
        return ("complete", None)
    if getattr(art, "analyzed_at", None) is not None and not has_structured:
        return (
            "pending",
            "Analyse passée mais sans puces visibles — relancer si besoin.",
        )
    return (
        "pending",
        "Analyse experte en attente (prochain passage pipeline ou relance régie).",
    )
