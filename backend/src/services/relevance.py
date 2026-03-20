"""
Editorial relevance scoring for OLJ press review.

Computes a 0-100 score based on:
  - Country proximity to MENA/OLJ editorial focus
  - Article type (opinion/editorial > analysis > news)
  - Freshness (today > yesterday > older)
  - Source language diversity bonus
  - Source tier (T1 > T2 > T3)
  - Content richness (has summary, quotes, entities)
"""

from datetime import datetime, timezone

COUNTRY_WEIGHTS = {
    "LB": 1.0,
    "IL": 0.95,
    "IR": 0.90,
    "SY": 0.90,
    "IQ": 0.85,
    "SA": 0.85,
    "AE": 0.80,
    "QA": 0.80,
    "JO": 0.80,
    "EG": 0.75,
    "TR": 0.75,
    "YE": 0.70,
    "KW": 0.70,
    "BH": 0.70,
    "US": 0.60,
    "GB": 0.55,
    "FR": 0.50,
}

TYPE_WEIGHTS = {
    "editorial": 1.0,
    "opinion": 0.95,
    "tribune": 0.90,
    "analysis": 0.80,
    "interview": 0.70,
    "reportage": 0.65,
    "news": 0.40,
}

LANG_DIVERSITY_BONUS = {
    "ar": 0.10,
    "he": 0.10,
    "fa": 0.08,
    "tr": 0.06,
    "ku": 0.06,
    "en": 0.0,
    "fr": 0.0,
}

TIER_WEIGHTS = {
    1: 1.0,
    2: 0.85,
    3: 0.70,
}


def compute_editorial_relevance(
    country_code: str,
    article_type: str | None,
    published_at: datetime | None,
    source_language: str | None,
    tier: int = 2,
    has_summary: bool = False,
    has_quotes: bool = False,
) -> int:
    """Return 0-100 score. Higher = more relevant for OLJ press review."""

    country_score = COUNTRY_WEIGHTS.get(country_code, 0.40)

    type_score = TYPE_WEIGHTS.get(article_type or "news", 0.40)

    now = datetime.now(timezone.utc)
    if published_at:
        age_hours = (now - published_at).total_seconds() / 3600
        if age_hours < 12:
            freshness = 1.0
        elif age_hours < 24:
            freshness = 0.90
        elif age_hours < 48:
            freshness = 0.70
        elif age_hours < 72:
            freshness = 0.50
        else:
            freshness = 0.30
    else:
        freshness = 0.40

    lang_bonus = LANG_DIVERSITY_BONUS.get(source_language or "fr", 0.0)

    tier_score = TIER_WEIGHTS.get(tier, 0.70)

    richness = 0.0
    if has_summary:
        richness += 0.05
    if has_quotes:
        richness += 0.05

    raw = (
        country_score * 0.30
        + type_score * 0.30
        + freshness * 0.20
        + tier_score * 0.10
        + lang_bonus
        + richness
    )

    return min(100, max(0, round(raw * 100)))


def compute_topic_overlap_bonus(
    article_topic_ids: list[str] | None,
    topics_of_day: list[str] | None,
    *,
    max_bonus: int = 12,
) -> tuple[int, list[str]]:
    """Bonus si l’article partage des thèmes avec OLJ_TOPICS_OF_DAY.json."""
    if not article_topic_ids or not topics_of_day:
        return 0, []
    want = set(topics_of_day)
    overlap = [t for t in article_topic_ids if t in want]
    if not overlap:
        return 0, []
    # Plafonner : 4 points par topic en overlap, max max_bonus
    bonus = min(max_bonus, len(overlap) * 4)
    return bonus, overlap


def explain_editorial_relevance(
    country_code: str,
    article_type: str | None,
    published_at,
    source_language: str | None,
    tier: int = 2,
    has_summary: bool = False,
    has_quotes: bool = False,
    olj_topic_ids: list[str] | None = None,
    topics_of_day: list[str] | None = None,
) -> dict:
    """
    Score final + décomposition pour l’API (why_ranked).
    Le bonus « topics du jour » s’ajoute après normalisation du score de base.
    """
    base = compute_editorial_relevance(
        country_code=country_code,
        article_type=article_type,
        published_at=published_at,
        source_language=source_language,
        tier=tier,
        has_summary=has_summary,
        has_quotes=has_quotes,
    )
    bonus, overlap = compute_topic_overlap_bonus(olj_topic_ids, topics_of_day)
    final = min(100, base + bonus)
    return {
        "score": final,
        "base_score": base,
        "topic_of_day_bonus": bonus,
        "topics_of_day_overlap": overlap,
        "factors": {
            "country_code": country_code,
            "article_type": article_type or "news",
            "tier": tier,
            "has_summary": has_summary,
            "has_quotes": has_quotes,
            "source_language": source_language,
        },
    }
