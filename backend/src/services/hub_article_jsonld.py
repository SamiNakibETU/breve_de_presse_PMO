"""
Repli extraction via JSON-LD (NewsArticle.articleBody, etc.) quand Trafilatura / BS4 sont courts.
Beaucoup de CMS exposent le corps complet dans ``<script type=\"application/ld+json\">``.
"""

from __future__ import annotations

import json
from typing import Any, Iterable

from bs4 import BeautifulSoup

from src.services.article_body_format import format_plain_article_text

_ARTICLE_TYPES = frozenset(
    {
        "newsarticle",
        "article",
        "blogposting",
        "opinionnewsarticle",
        "webpage",
        "reportagearticle",
    }
)


def _type_names(node: dict[str, Any]) -> set[str]:
    raw = node.get("@type")
    if raw is None:
        return set()
    if isinstance(raw, list):
        return {str(x).lower() for x in raw if x}
    return {str(raw).lower()}


def _walk_json(obj: Any) -> Iterable[dict[str, Any]]:
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _walk_json(v)
    elif isinstance(obj, list):
        for x in obj:
            yield from _walk_json(x)


def extract_best_article_body_from_jsonld(html: str) -> str:
    """Retourne le plus long ``articleBody`` plausible trouvé dans le HTML."""
    if not html or len(html) < 200:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    best = ""
    best_score = 0
    for script in soup.find_all("script", attrs={"type": True}):
        t = (script.get("type") or "").lower()
        if "ld+json" not in t:
            continue
        raw = (script.string or "").strip()
        if not raw:
            raw = script.get_text(separator="\n", strip=False).strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for node in _walk_json(data):
            if not isinstance(node, dict):
                continue
            types = _type_names(node)
            type_boost = 2 if types & _ARTICLE_TYPES else 1
            for key, field_weight, min_len in (
                ("articleBody", 4, 72),
                ("text", 3, 120),
                ("description", 1, 520),
            ):
                raw_val = node.get(key)
                if not isinstance(raw_val, str):
                    continue
                ab = raw_val.strip()
                if len(ab) < min_len:
                    continue
                score = type_boost * field_weight * 1_000_000 + len(ab)
                if score > best_score:
                    best_score = score
                    best = ab
    if not best:
        return ""
    return format_plain_article_text(best)


def merge_longest_body_with_jsonld(html: str | None, body: str) -> str:
    """Si JSON-LD fournit un corps plus long que l’extraction classique, le prendre."""
    if not html:
        return body
    extra = extract_best_article_body_from_jsonld(html)
    if len(extra) > len(body or ""):
        return extra
    return body or ""
