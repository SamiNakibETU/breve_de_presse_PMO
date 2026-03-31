"""
Heuristiques sur HTML déjà récupéré (pas d’appel réseau).
Aligné sur la détection Cloudflare de hub_rss pour éviter la divergence.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from src.services.hub_rss import is_cloudflare_interstitial_html


def _norm_host(url: str) -> str:
    try:
        n = urlparse(url).netloc.lower()
        if n.startswith("www."):
            n = n[4:]
        return n
    except Exception:
        return ""


def _count_same_origin_hrefs(html: str, page_url: str) -> int:
    host = _norm_host(page_url)
    if not host:
        return html.lower().count("href=")
    low = html.lower()
    # Liens absolus même host
    pat_abs = re.compile(
        rf'href=["\']https?://(?:www\.)?{re.escape(host)}[^"\']*["\']',
        re.I,
    )
    n_abs = len(pat_abs.findall(html))
    # Liens relatifs (heuristique : / quelque chose)
    n_rel = len(re.findall(r'href=["\']/(?!/)[^"\'#?]+["\']', html, re.I))
    return n_abs + n_rel


def analyze_hub_html(html: str, page_url: str) -> dict[str, Any]:
    """
    Retourne un dict sérialisable avec diagnosis_class et signaux numériques / bool.
    """
    if not html:
        return {
            "diagnosis_class": "thin_html",
            "signals": {"html_len": 0, "reason": "empty"},
        }

    n = len(html)
    low = html.lower()
    signals: dict[str, Any] = {
        "html_len": n,
        "href_total_approx": low.count("href="),
        "same_origin_href_approx": _count_same_origin_hrefs(html, page_url),
    }

    if is_cloudflare_interstitial_html(html):
        signals["cloudflare_marker"] = True
        return {"diagnosis_class": "cf_block", "signals": signals}

    # Autres marqueurs CF / challenge (sans dupliquer toute la logique hub_rss)
    head = low[:12000]
    if "cf-ray" in head and n < 50_000:
        signals["cf_ray_header_like"] = True
    if "turnstile" in head and "cloudflare" in head:
        signals["turnstile_mention"] = True

    spa_markers = (
        "__next_data__" in low,
        "__nuxt__" in low,
        "window.__initial" in low,
        'id="root"' in low or "id='root'" in low,
        'id="__next"' in low,
    )
    signals["spa_marker_hits"] = sum(1 for x in spa_markers if x)

    has_ld_json = "application/ld+json" in low
    has_article_tag = bool(re.search(r"<article[\s>]", html, re.I))
    signals["has_ld_json"] = has_ld_json
    signals["has_article_tag"] = has_article_tag

    if signals.get("turnstile_mention") or (
        signals.get("cf_ray_header_like") and signals["same_origin_href_approx"] < 5
    ):
        return {"diagnosis_class": "cf_block", "signals": signals}

    if signals["spa_marker_hits"] >= 2 and signals["same_origin_href_approx"] < 12:
        return {"diagnosis_class": "spa_shell", "signals": signals}

    if n < 2500 and signals["href_total_approx"] < 25:
        return {"diagnosis_class": "thin_html", "signals": signals}

    if has_article_tag or has_ld_json or signals["same_origin_href_approx"] >= 15:
        return {"diagnosis_class": "looks_editorial", "signals": signals}

    return {"diagnosis_class": "unknown", "signals": signals}


def merge_diagnosis_priority(classes: list[str]) -> str:
    """Résumé hub : classe la plus bloquante d’abord (cf > spa > …)."""
    order = ["cf_block", "spa_shell", "thin_html", "unknown", "looks_editorial"]
    want = set(classes)
    for c in order:
        if c in want:
            return c
    return "unknown"
