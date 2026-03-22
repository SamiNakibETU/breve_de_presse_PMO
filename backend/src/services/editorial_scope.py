"""
Filtre « revue de presse géopolitique » : rejette lifestyle / voyage / cuisine
qui passaient avant (ex. flux opinion + mot « Turquie » / « turquie » seul).

Utilisé à l’ingestion (RSS, web, Playwright) et pour restreindre le clustering.
"""

from __future__ import annotations

import re
import unicodedata

# --- Hors-périmètre : si une de ces sous-chaînes est présente, on rejette ---
# (titres + résumé / début de corps, texte normalisé minuscules)
LIFESTYLE_TRAVEL_SUBSTRINGS: tuple[str, ...] = (
    # FR
    "voyage et cuisine",
    "voyage en ",
    "voyages en ",
    "guide de voyage",
    "tourisme en ",
    "gastronomie",
    "recette de ",
    "recettes de ",
    "meilleurs restaurants",
    "où manger",
    "hôtels de luxe",
    "week-end à ",
    "weekend à ",
    # EN
    "travel guide",
    "travel to ",
    "tourism in ",
    "culinary ",
    "food and travel",
    "recipe for ",
    "best restaurants in ",
    "where to eat",
    "hotel review",
    "luxury hotel",
    "things to do in ",  # listicles voyage
    "vacation in ",
    # TR (souvent mélangé dans titres anglais de sites TR)
    "seyahat",
    "gezi rehberi",
    "yemek tarifi",
    # AR (voyage / loisir)
    "السياحة في",
    "وصفة ",
    "أفضل المطاعم",
    # MEMW spec v3 sprint 2 — lifestyle additionnel
    "coiffure",
    "cheveux",
    "mode et beauté",
    "look du jour",
    "horoscope",
    "astrologie",
    "signe du zodiaque",
    "développement personnel",
    "bien-être",
    "mariage",
    "noces",
    "robe de mariée",
    "hairstyle",
    "hair color",
    "fashion trend",
    "zodiac",
    "self-help",
    "wellness tips",
    "wedding",
    "bride",
    "celebrity gossip",
    "saç modeli",
    "moda",
    "burç",
    "düğün",
    "تسريحات شعر",
    "أبراج",
    "زفاف",
    "موضة",
)

# Sports / divertissement pur (hors angle géopolitique)
LEISURE_SUBSTRINGS: tuple[str, ...] = (
    "world cup",
    "champions league",
    "premier league",
    "super bowl",
    "nba finals",
    "oscar nomination",
    "grammy ",
    "met gala",
    "fashion week",
    "celebrity ",
)

# Mots-clés géopolitiques (union EN/FR/AR) — sans pays « seuls » trop ambigus
_GEO_EN = {
    "iran", "israel", "hezbollah", "hamas", "gaza", "lebanon", "war",
    "missile", "strike", "bomb", "sanctions", "ceasefire", "hostage",
    "military", "pentagon", "idf", "irgc", "hormuz", "gulf", "oil",
    "nuclear", "drone", "conflict", "escalation", "retaliation",
    "middle east", "syria", "iraq", "yemen", "houthi", "casualties",
    "refugee", "displaced", "crisis", "diplomacy", "negotiation",
    "occupation", "resistance", "netanyahu", "khamenei", "biden",
    "trump", "un security", "humanitarian", "siege", "blockade",
    "west bank", "settler", "annexation", "proxy", "axis",
    "erdogan", "offensive", "invasion", "airstrike", "armed",
    "troops", "border", "attack", "killed", "deadly", "explosion",
    "terror", "militant", "regime", "sanction", "embargo",
}
_GEO_FR = {
    "iran", "israël", "hezbollah", "hamas", "gaza", "liban", "guerre",
    "missile", "frappe", "bombe", "sanctions", "cessez-le-feu", "otage",
    "militaire", "pentagone", "tsahal", "ormuz", "golfe", "pétrole",
    "nucléaire", "drone", "conflit", "escalade", "représailles",
    "moyen-orient", "syrie", "irak", "yémen", "houthi", "victimes",
    "réfugié", "déplacé", "crise", "diplomatie", "négociation",
    "occupation", "résistance", "netanyahou", "khamenei",
    "humanitaire", "siège", "blocus", "cisjordanie", "colon",
    "annexion", "erdogan", "offensive", "invasion", "attentat",
    "terrorisme", "combats", "frontière", "frappes",
}
_GEO_AR = {
    "إيران", "إسرائيل", "حزب الله", "حماس", "غزة", "لبنان", "حرب",
    "صاروخ", "قصف", "عقوبات", "وقف إطلاق النار", "رهينة",
    "عسكري", "هرمز", "خليج", "نفط", "نووي", "صراع", "تصعيد",
    "الشرق الأوسط", "سوريا", "العراق", "اليمن", "حوثي",
    "أزمة", "دبلوماسية", "مفاوضات", "احتلال", "مقاومة",
    "إنساني", "حصار", "الضفة الغربية", "استيطان",
}

# Retiré volontairement des déclencheurs « seuls » : turkey/turquie/تركيا/egypt…
# (sinon « voyage en Turquie » ou seul pays matche encore via d’autres chemins)
_COUNTRY_ONLY: frozenset[str] = frozenset({
    "turkey", "turquie", "türkiye", "تركيا",
    "egypt", "égypte", "egypte", "مصر",
    "jordan", "jordanie", "الأردن",
    "qatar", "قطر",
    "kuwait", "koweït", "الكويت",
    "uae", "emirates", "émirats", "الإمارات",
    "saudi", "saoudite", "arabie",
    "morocco", "maroc", "algérie", "algeria", "tunisia", "tunisie",
    "peace", "paix", "trêve", "truce",  # trop générique seuls
})

GEO_KEYWORDS: frozenset[str] = frozenset(_GEO_EN | _GEO_FR | _GEO_AR)

# py3langid confond ar/fa : correction selon le pays du média (MEMW §2.2.2).
ARABIC_MEDIA_COUNTRY_CODES: frozenset[str] = frozenset({
    "LB", "SA", "AE", "EG", "JO", "QA", "KW", "BH", "YE", "SY", "IQ", "OM",
    "DZ", "MA", "TN", "LY", "SD", "PS",
})


def override_langid_ar_fa(detected: str, country_code: str) -> str:
    cc = (country_code or "").strip().upper()
    if detected == "ar" and cc == "IR":
        return "fa"
    if detected == "fa" and cc in ARABIC_MEDIA_COUNTRY_CODES:
        return "ar"
    return detected


# Signaux « faibles » seuls : titre peut être ambigu (ex. « crise » sans conflit armé explicite).
_WEAK_GEO_KEYWORDS: frozenset[str] = frozenset({
    "peace", "paix", "crisis", "crise", "diplomacy", "diplomatie",
    "negotiation", "négociation", "talks", "humanitarian", "humanitaire",
    "refugee", "réfugié", "displaced", "déplacé", "border", "frontière",
})


def normalize_for_match(text: str) -> str:
    if not text:
        return ""
    t = unicodedata.normalize("NFKC", text).lower()
    t = re.sub(r"\s+", " ", t).strip()
    return t


def is_out_of_scope_lifestyle(text: str) -> bool:
    """True = ne pas ingérer / ne pas clusteriser (lifestyle, voyage, sport pur…)."""
    t = normalize_for_match(text)
    if not t:
        return False
    for needle in LIFESTYLE_TRAVEL_SUBSTRINGS:
        if needle in t:
            return True
    for needle in LEISURE_SUBSTRINGS:
        if needle in t:
            return True
    return False


def _kw_in_text(t: str, kw: str) -> bool:
    """Évite les faux positifs type « war » dans « award » pour mots courts latins."""
    if len(kw) <= 4 and kw.isascii() and kw.isalpha():
        return re.search(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", t) is not None
    return kw in t


def _matching_geo_keywords(t: str) -> set[str]:
    found: set[str] = set()
    for kw in GEO_KEYWORDS:
        if _kw_in_text(t, kw):
            found.add(kw)
    return found


def has_geopolitical_relevance_signal(title: str, summary: str = "") -> bool:
    """
    Pour flux RSS non-opinion : au moins un signal géopolitique « fort »,
    et pas uniquement un nom de pays générique.
    """
    t = normalize_for_match(f"{title} {summary}")
    if not t or is_out_of_scope_lifestyle(t):
        return False

    found = _matching_geo_keywords(t)
    if not found:
        return False
    if found <= _COUNTRY_ONLY:
        return False
    return True


def snippet_for_ingestion_gate(text: str, max_chars: int | None = None) -> str:
    """Extrait nettoyé tronqué pour le gate LLM (résumé RSS ou début de corps)."""
    from src.config import get_settings

    cap = max_chars if max_chars is not None else get_settings().ingestion_llm_gate_summary_max_chars
    t = (text or "").strip()
    if len(t) <= cap:
        return t
    return t[:cap]


def needs_post_extract_llm_gate(title: str, body_excerpt: str) -> bool:
    """
    Après fetch page : même logique que le gate RSS, sur titre + extrait corps (MEMW §2.1.4).
    """
    ex = snippet_for_ingestion_gate(body_excerpt, max_chars=2000)
    return needs_ingestion_llm_gate(title, ex, uses_opinion_feed=False)


def needs_ingestion_llm_gate(
    title: str,
    summary: str,
    uses_opinion_feed: bool,
) -> bool:
    """
    Cas « moyennement » géopolitiques : heuristique positive mais signal faible.
    Appel LLM léger recommandé (MEMW §2.1.4).
    """
    if uses_opinion_feed:
        return False
    if not has_geopolitical_relevance_signal(title, summary):
        return False
    t = normalize_for_match(f"{title} {summary}")
    found = _matching_geo_keywords(t)
    non_country = found - _COUNTRY_ONLY
    if not non_country:
        return False
    if non_country <= _WEAK_GEO_KEYWORDS:
        return True
    title_words = len(normalize_for_match(title).split())
    if title_words <= 5 and len(non_country) <= 2:
        return True
    return False


def should_ingest_rss_entry(title: str, summary: str, uses_opinion_feed: bool) -> bool:
    """
    - Toujours exclure lifestyle/voyage même sur flux « opinion ».
    - Flux opinion : après filtre lifestyle, on accepte.
    - Flux généraliste : signal géopolitique requis.
    """
    combined = f"{title} {summary}"
    if is_out_of_scope_lifestyle(combined):
        return False
    if uses_opinion_feed:
        return True
    return has_geopolitical_relevance_signal(title, summary)


def should_ingest_scraped_article(title: str, content_snippet: str) -> bool:
    """Pages opinion : on filtre quand même le bruit lifestyle évident."""
    snippet = content_snippet[:2500] if content_snippet else ""
    combined = f"{title} {snippet}"
    if is_out_of_scope_lifestyle(combined):
        return False
    return True


def is_article_eligible_for_clustering(
    title_fr: str | None,
    title_original: str,
    summary_fr: str | None,
    article_type: str | None,
    editorial_types: frozenset[str],
    enforce_editorial_types: bool,
    *,
    relevance_score: float | None = None,
    relevance_band: str | None = None,
) -> bool:
    """Optionnellement restreint aux types éditoriaux ; exclut lifestyle et hors-sujet (Prompt 5)."""
    if relevance_band == "out_of_scope":
        return False
    if relevance_score is not None and relevance_score < 0.40:
        return False
    if enforce_editorial_types:
        if not article_type or article_type not in editorial_types:
            return False

    title = (title_fr or title_original or "").strip()
    summ = (summary_fr or "")[:1200]
    combined = f"{title} {summ}"
    if is_out_of_scope_lifestyle(combined):
        return False
    return True
