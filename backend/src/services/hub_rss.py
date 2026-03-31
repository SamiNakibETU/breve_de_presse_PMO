"""
Extraction de liens d’articles depuis un flux RSS/Atom (fallback quand HTML/Playwright = Cloudflare).
"""

from __future__ import annotations

import feedparser
import structlog

logger = structlog.get_logger(__name__)


def body_looks_like_rss_or_atom(body: str) -> bool:
    if not body or len(body) < 80:
        return False
    head = body.lstrip()[:2500].lower()
    return (
        "<rss" in head
        or "<feed" in head
        or "xmlns:atom" in head
        or "<rdf:rdf" in head
    )


def is_cloudflare_interstitial_html(html: str) -> bool:
    """Page challenge / « Just a moment » — pas du contenu éditorial."""
    if not html or len(html) < 600:
        return False
    low = html.lower()
    return (
        "cdn-cgi/challenge" in low
        or "cf-browser-verification" in low
        or "challenge-platform" in low
        or ("just a moment" in low and "cloudflare" in low)
        or "turnstile" in low and "cloudflare" in low
    )


def extract_article_links_from_feed_body(
    body: str,
    max_links: int,
    *,
    link_must_contain: str | None = None,
) -> list[str]:
    """Parse RSS/Atom ; optionnellement ne garde que les liens contenant une sous-chaîne (ex. /opinion/)."""
    parsed = feedparser.parse(body)
    if getattr(parsed, "bozo", False) and not parsed.entries:
        logger.debug(
            "hub_rss.parse_bozo",
            exc=str(getattr(parsed, "bozo_exception", ""))[:120],
        )

    out: list[str] = []
    seen: set[str] = set()
    needle_raw = (link_must_contain or "").strip() or None
    needle_lower = needle_raw.lower() if needle_raw else None

    for entry in parsed.entries or []:
        link = (entry.get("link") or "").strip()
        if not link or link in seen:
            continue
        if needle_lower and needle_lower not in link.lower():
            continue
        seen.add(link)
        out.append(link)
        if len(out) >= max_links:
            break

    return out
