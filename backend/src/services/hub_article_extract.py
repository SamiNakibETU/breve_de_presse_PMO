"""
Extraction du contenu d’une page article (hubs opinion) — même pipeline que la collecte en production.

HTTP (aiohttp → curl_cffi → trafilatura) puis Playwright si corps trop court / Cloudflare.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import Optional

import structlog
import trafilatura

from src.config import get_settings
from src.services.article_body_format import (
    format_plain_article_text,
    is_substantial_article_body,
)
from src.services.hub_fetch import fetch_html_robust, sanitize_structlog_payload
from src.services.hub_playwright import HubPlaywrightBrowser, PLAYWRIGHT_AVAILABLE
from src.services.hub_rss import is_cloudflare_interstitial_html
from src.services.web_scraper import (
    _extract_author_from_html,
    _extract_date_from_html,
    _extract_title_from_html,
)

logger = structlog.get_logger(__name__)


def html_to_article_body_sync(html: str) -> str:
    """Trafilatura + nettoyage + format_plain_article_text (thread-safe)."""
    if not html:
        return ""
    text = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=False,
        favor_recall=True,
        output_format="txt",
        deduplicate=True,
    )
    if not text or len(text) < 80:
        text = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=False,
            favor_precision=True,
            output_format="txt",
        )
    if not text:
        return ""
    for pattern in (
        r"©\s*\d{4}.*$",
        r"All rights reserved.*$",
        r"Subscribe to .*$",
        r"Share this article.*$",
        r"تابعونا.*$",
    ):
        text = re.sub(pattern, "", text, flags=re.IGNORECASE | re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return format_plain_article_text(text)


async def extract_hub_article_page(
    url: str,
    *,
    pw: HubPlaywrightBrowser | None = None,
    pw_lock: asyncio.Lock | None = None,
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[datetime], str]:
    """
    Retourne (corps, auteur, titre, date_pub, stratégie).
    stratégie : aiohttp | aiohttp+playwright | playwright | none
    """
    settings = get_settings()
    min_chars = max(settings.min_article_length, 180)
    min_words = settings.opinion_hub_min_article_words

    strategy: list[str] = []
    author: Optional[str] = None
    pub_date: Optional[datetime] = None
    title: Optional[str] = None
    body = ""

    html, err = await fetch_html_robust(url, try_trafilatura_fallback=True)
    if html and is_cloudflare_interstitial_html(html):
        logger.debug(
            "hub_article_extract.cf_skip_http",
            **sanitize_structlog_payload({"url": url[:80]}),
        )
        html = None
    if html and len(html) >= 500:
        strategy.append("aiohttp")
        author = _extract_author_from_html(html)
        pub_date = _extract_date_from_html(html)
        title = _extract_title_from_html(html)
        body = await asyncio.to_thread(html_to_article_body_sync, html)
    else:
        logger.debug(
            "hub_article_extract.http_weak",
            **sanitize_structlog_payload(
                {"url": url[:80], "err": err[:60] if err else ""},
            ),
        )

    need_pw = PLAYWRIGHT_AVAILABLE and pw is not None and (
        not body
        or not is_substantial_article_body(body, min_chars=min_chars, min_words=min_words)
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
            if "aiohttp" in strategy:
                strategy.append("playwright")
            else:
                strategy = ["playwright"]
            author = author or _extract_author_from_html(html2)
            pub_date = pub_date or _extract_date_from_html(html2)
            title = title or _extract_title_from_html(html2)
            body2 = await asyncio.to_thread(html_to_article_body_sync, html2)
            if len(body2) > len(body):
                body = body2

    if (
        settings.enhanced_scraper_enabled
        and PLAYWRIGHT_AVAILABLE
        and pw is not None
        and body
        and not is_substantial_article_body(
            body,
            min_chars=min_chars,
            min_words=min_words,
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
            if strategy:
                strategy.append("enhanced_scroll")
            else:
                strategy = ["playwright", "enhanced_scroll"]
            author = author or _extract_author_from_html(html_scroll)
            pub_date = pub_date or _extract_date_from_html(html_scroll)
            title = title or _extract_title_from_html(html_scroll)
            body3 = await asyncio.to_thread(html_to_article_body_sync, html_scroll)
            if len(body3) > len(body):
                body = body3

    if settings.enhanced_scraper_enabled and (
        not body
        or not is_substantial_article_body(
            body,
            min_chars=min_chars,
            min_words=min_words,
        )
    ):
        from src.services.enhanced_scraper import extract_with_cascade

        cascade_body, cascade_author, cascade_title, cascade_date, cascade_method, _cascade_attempts = (
            await extract_with_cascade(
                url,
                pw=pw,
                pw_lock=pw_lock,
                min_chars=min_chars,
                min_words=min_words,
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
    if not body:
        return None, author, title, pub_date, strat
    return body, author, title, pub_date, strat
