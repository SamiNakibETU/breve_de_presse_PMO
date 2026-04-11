"""
Extraction du contenu d’une page article (hubs opinion) — même pipeline que la collecte en production.

HTTP (aiohttp → curl_cffi → trafilatura) puis Playwright si corps trop court / Cloudflare.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin

import structlog
import trafilatura
from bs4 import BeautifulSoup

from src.config import get_settings
from src.services.article_body_format import (
    format_plain_article_text,
    is_substantial_article_body,
)
from src.services.hub_article_jsonld import merge_longest_body_with_jsonld
from src.services.hub_fetch import fetch_html_robust, sanitize_structlog_payload
from src.services.hub_playwright import HubPlaywrightBrowser, PLAYWRIGHT_AVAILABLE
from src.services.hub_rss import is_cloudflare_interstitial_html
from src.services.content_display_sanitize import sanitize_extracted_plain_text
from src.services.smart_content import extract_main_text
from src.services.web_scraper import (
    _extract_author_from_html,
    _extract_date_from_html,
    _extract_title_from_html,
)

logger = structlog.get_logger(__name__)

_IMAGE_MIN_DIMENSION = 100  # pixels — filtrer les pixels de tracking 1×1


def extract_image_url_from_html(html: str, page_url: str = "") -> Optional[str]:
    """
    Extrait l'URL de l'image principale d'un article HTML.

    Priorité : JSON-LD (image / thumbnailUrl) > og:image > twitter:image > premier <img> significatif du body.
    """
    if not html:
        return None

    soup = BeautifulSoup(html, "html.parser")

    # 1. JSON-LD
    for script in soup.find_all("script", attrs={"type": True}):
        if "ld+json" not in (script.get("type") or "").lower():
            continue
        raw = (script.string or "").strip() or script.get_text(strip=True)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        nodes = data if isinstance(data, list) else [data]
        for node in nodes:
            if not isinstance(node, dict):
                continue
            for key in ("image", "thumbnailUrl", "thumbnail"):
                val = node.get(key)
                if isinstance(val, str) and val.startswith("http"):
                    return val
                if isinstance(val, dict):
                    url_val = val.get("url", "")
                    if isinstance(url_val, str) and url_val.startswith("http"):
                        return url_val
                if isinstance(val, list) and val:
                    first = val[0]
                    if isinstance(first, str) and first.startswith("http"):
                        return first
                    if isinstance(first, dict):
                        url_val = first.get("url", "")
                        if isinstance(url_val, str) and url_val.startswith("http"):
                            return url_val

    # 2. Open Graph / Twitter Card
    for prop in ("og:image", "twitter:image", "og:image:url"):
        tag = soup.find("meta", attrs={"property": prop}) or soup.find(
            "meta", attrs={"name": prop}
        )
        if tag:
            content = tag.get("content", "")
            if isinstance(content, str) and content.startswith("http"):
                return content

    # 3. Premier <img> significatif dans le body
    for img in soup.find_all("img", src=True):
        src = img.get("src", "")
        if not src:
            continue
        if src.startswith("//"):
            src = "https:" + src
        elif not src.startswith("http") and page_url:
            try:
                src = urljoin(page_url, src)
            except Exception:
                continue
        if not src.startswith("http"):
            continue
        try:
            w = int(img.get("width") or 0)
            h = int(img.get("height") or 0)
            if w and h and (w < _IMAGE_MIN_DIMENSION or h < _IMAGE_MIN_DIMENSION):
                continue
        except (ValueError, TypeError):
            pass
        if any(x in src.lower() for x in ("pixel", "tracking", "beacon", "1x1", "logo", ".svg")):
            continue
        return src

    return None


def html_to_smart_content_body_sync(html: str, page_url: str) -> str:
    """Repli Trafilatura + BS4 (aligné sur ``smart_content.extract_main_text`` / scraper cascade)."""
    if not html:
        return ""
    text, _title, _wc = extract_main_text(html, page_url)
    if not text:
        return ""
    return format_plain_article_text(text)


def html_to_article_body_sync(html: str) -> str:
    """Trafilatura + nettoyage + format_plain_article_text (thread-safe)."""
    if not html:
        return ""
    # fast=True : évite compare_extraction → justext (stoplists lourdes, MemoryError possible sur grosses pages).
    try:
        text = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=False,
            favor_recall=True,
            output_format="txt",
            deduplicate=True,
            fast=True,
        )
        if not text or len(text) < 80:
            text = trafilatura.extract(
                html,
                include_comments=False,
                include_tables=False,
                favor_precision=True,
                output_format="txt",
                fast=True,
            )
    except MemoryError:
        text = None
    if not text:
        return ""
    for pattern in (
        r"©\s*\d{4}.*$",
        r"All rights reserved.*$",
        r"Subscribe to .*$",
        r"Share this article.*$",
        r"تابعونا.*$",
        r"^Partager\s*(LinkedIn|Facebook|Twitter|X|Flipboard|WhatsApp)?.*$",
        r"^Copier le lien.*$",
        r"^Taille du texte.*$",
        r"^La suite de l'article\s+[A-Z].*$",
        r"^(Share|Tweet|Pin)\s+(Share|Tweet|Pin).*$",
        r"^\s*\d+\s*min(utes?)?\s*(de lecture|read)?\s*$",
    ):
        text = re.sub(pattern, "", text, flags=re.IGNORECASE | re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return format_plain_article_text(text)


async def extract_hub_article_page(
    url: str,
    *,
    pw: HubPlaywrightBrowser | None = None,
    pw_lock: asyncio.Lock | None = None,
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[datetime], str, Optional[str]]:
    """
    Retourne (corps, auteur, titre, date_pub, stratégie, image_url).
    stratégie : aiohttp | aiohttp+playwright | playwright | none
    """
    settings = get_settings()
    min_chars = max(settings.min_article_length, 180)
    min_words = settings.opinion_hub_min_article_words
    # Teasers paywall ~80–100 mots : forcer PW / scroll si le seuil config est bas (ex. 45).
    min_words_fetch = max(min_words, 115)

    strategy: list[str] = []
    author: Optional[str] = None
    pub_date: Optional[datetime] = None
    title: Optional[str] = None
    image_url: Optional[str] = None
    body = ""
    _best_html: Optional[str] = None

    html, err = await fetch_html_robust(url, try_trafilatura_fallback=True)
    if html and is_cloudflare_interstitial_html(html):
        logger.debug(
            "hub_article_extract.cf_skip_http",
            **sanitize_structlog_payload({"url": url[:80]}),
        )
        html = None
    if html and len(html) >= 500:
        strategy.append("aiohttp")
        _best_html = html
        author = _extract_author_from_html(html)
        pub_date = _extract_date_from_html(html)
        title = _extract_title_from_html(html)
        body = await asyncio.to_thread(html_to_article_body_sync, html)
        alt = await asyncio.to_thread(html_to_smart_content_body_sync, html, url)
        if len(alt) > len(body):
            body = alt
        body = merge_longest_body_with_jsonld(html, body)
    else:
        logger.debug(
            "hub_article_extract.http_weak",
            **sanitize_structlog_payload(
                {"url": url[:80], "err": err[:60] if err else ""},
            ),
        )

    need_pw = PLAYWRIGHT_AVAILABLE and pw is not None and (
        not body
        or not is_substantial_article_body(body, min_chars=min_chars, min_words=min_words_fetch)
    )

    if need_pw:
        lock = pw_lock or asyncio.Lock()
        html2: Optional[str] = None
        async with lock:
            if not pw.started and not getattr(pw, "_start_failed", False):
                await pw.start()
            if pw.started:
                html2, pw_err = await pw.fetch_html(
                    url,
                    wait_ms=4500,
                    scroll_page=False,
                    wait_until="domcontentloaded",
                    timeout_ms=90000,
                    block_heavy_assets=True,
                )
                if (
                    html2
                    and is_cloudflare_interstitial_html(html2)
                    and settings.hub_playwright_cf_relaxed_retry
                ):
                    html2, pw_err = await pw.fetch_html(
                        url,
                        wait_ms=9500,
                        scroll_page=False,
                        wait_until="load",
                        timeout_ms=105000,
                        block_heavy_assets=True,
                    )
                if not html2:
                    logger.debug(
                        "hub_article_extract.pw_fetch",
                        **sanitize_structlog_payload(
                            {"url": url[:80], "err": pw_err[:60]},
                        ),
                    )
        if html2 and is_cloudflare_interstitial_html(html2):
            html2 = None
        if html2 and len(html2) >= 500:
            _best_html = html2
            if "aiohttp" in strategy:
                strategy.append("playwright")
            else:
                strategy = ["playwright"]
            author = author or _extract_author_from_html(html2)
            pub_date = pub_date or _extract_date_from_html(html2)
            title = title or _extract_title_from_html(html2)
            body2 = await asyncio.to_thread(html_to_article_body_sync, html2)
            alt2 = await asyncio.to_thread(html_to_smart_content_body_sync, html2, url)
            best = body2 if len(body2) >= len(alt2) else alt2
            if len(best) > len(body):
                body = best
            body = merge_longest_body_with_jsonld(html2, body)

    if (
        settings.enhanced_scraper_enabled
        and PLAYWRIGHT_AVAILABLE
        and pw is not None
        and body
        and not is_substantial_article_body(
            body,
            min_chars=min_chars,
            min_words=min_words_fetch,
        )
    ):
        lock = pw_lock or asyncio.Lock()
        html_scroll: Optional[str] = None
        async with lock:
            if not pw.started and not getattr(pw, "_start_failed", False):
                await pw.start()
            if pw.started:
                html_scroll, _pw_err = await pw.fetch_html(
                    url,
                    wait_ms=7000,
                    scroll_page=True,
                    wait_until="load",
                    timeout_ms=105000,
                    block_heavy_assets=True,
                )
        if (
            html_scroll
            and not is_cloudflare_interstitial_html(html_scroll)
            and len(html_scroll) >= 500
        ):
            _best_html = html_scroll
            if strategy:
                strategy.append("enhanced_scroll")
            else:
                strategy = ["playwright", "enhanced_scroll"]
            author = author or _extract_author_from_html(html_scroll)
            pub_date = pub_date or _extract_date_from_html(html_scroll)
            title = title or _extract_title_from_html(html_scroll)
            body3 = await asyncio.to_thread(html_to_article_body_sync, html_scroll)
            alt3 = await asyncio.to_thread(html_to_smart_content_body_sync, html_scroll, url)
            best3 = body3 if len(body3) >= len(alt3) else alt3
            if len(best3) > len(body):
                body = best3
            body = merge_longest_body_with_jsonld(html_scroll, body)

    if settings.enhanced_scraper_enabled and (
        not body
        or not is_substantial_article_body(
            body,
            min_chars=min_chars,
            min_words=min_words_fetch,
        )
    ):
        from src.services.enhanced_scraper import extract_with_cascade

        cascade_body, cascade_author, cascade_title, cascade_date, cascade_method, _cascade_attempts = (
            await extract_with_cascade(
                url,
                pw=pw,
                pw_lock=pw_lock,
                min_chars=min_chars,
                min_words=min_words_fetch,
            )
        )
        if cascade_body and (not body or len(cascade_body) > len(body)):
            body = cascade_body
            author = author or cascade_author
            title = title or cascade_title
            pub_date = pub_date or cascade_date
            if strategy:
                strategy.append(f"cascade:{cascade_method}")
            else:
                strategy = [f"cascade:{cascade_method}"]

    strat = "+".join(strategy) if strategy else "none"

    # Extraire l'image depuis le meilleur HTML disponible
    if _best_html:
        image_url = extract_image_url_from_html(_best_html, url)

    if not body:
        return None, author, title, pub_date, strat, image_url
    return sanitize_extracted_plain_text(body), author, title, pub_date, strat, image_url
