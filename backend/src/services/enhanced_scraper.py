"""
Scraping enrichi (MEMW v2) — cascade HTTP → curl_cffi → Playwright (nav partagée).

Lorsque ``enhanced_scraper_enabled`` est false, ``hub_article_extract`` reste le chemin principal ;
ce module fournit un dernier repli ``extract_with_cascade`` pour corps trop courts.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Optional

import structlog

from src.config import get_settings
from src.services.article_body_format import format_plain_article_text, is_substantial_article_body
from src.services.hub_fetch import _fetch_html_curl_cffi_sync, fetch_html_aiohttp
from src.services.hub_playwright import HubPlaywrightBrowser, PLAYWRIGHT_AVAILABLE
from src.services.hub_rss import is_cloudflare_interstitial_html
from src.services.smart_content import extract_main_text, is_cloudflare_challenge
from src.services.web_scraper import (
    _extract_author_from_html,
    _extract_date_from_html,
    _extract_title_from_html,
)

logger = structlog.get_logger(__name__)


def is_enhanced_scraper_active() -> bool:
    return bool(get_settings().enhanced_scraper_enabled)


async def extract_article_page_enhanced(
    url: str,
    *,
    pw: Any = None,
    pw_lock: asyncio.Lock | None = None,
):
    """Délègue à ``hub_article_extract`` (compatibilité)."""
    from src.services.hub_article_extract import extract_hub_article_page

    return await extract_hub_article_page(url, pw=pw, pw_lock=pw_lock)


def _parse_html_to_article(
    html: str,
    url: str,
    *,
    min_chars: int,
    min_words: int,
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[datetime], int] | None:
    if not html or len(html) < 500:
        return None
    if is_cloudflare_challenge(html) or is_cloudflare_interstitial_html(html):
        return None
    text, title_mt, words = extract_main_text(html, url)
    if not text:
        return None
    body = format_plain_article_text(text[:50000])
    if not is_substantial_article_body(body, min_chars=min_chars, min_words=min_words):
        return None
    author = _extract_author_from_html(html)
    title = title_mt or _extract_title_from_html(html)
    pub_date = _extract_date_from_html(html)
    return body, author, title, pub_date, words


async def extract_with_cascade(
    url: str,
    *,
    pw: HubPlaywrightBrowser | None = None,
    pw_lock: asyncio.Lock | None = None,
    min_chars: int | None = None,
    min_words: int | None = None,
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[datetime], str, int]:
    """
    Retourne (corps, auteur, titre, date_pub, méthode utilisée, nombre de tentatives).

    Ordre : aiohttp → curl_cffi → Playwright → Playwright scroll → (scrapling optionnel).
    """
    s = get_settings()
    mc = min_chars if min_chars is not None else max(s.min_article_length, 180)
    mw = min_words if min_words is not None else s.opinion_hub_min_article_words

    attempts = 0
    last_method = "none"

    def _try_html(html: str | None, method: str) -> tuple[Optional[str], Optional[str], Optional[str], Optional[datetime], str] | None:
        nonlocal attempts, last_method
        if not html:
            return None
        attempts += 1
        last_method = method
        parsed = _parse_html_to_article(html, url, min_chars=mc, min_words=mw)
        if parsed is None:
            return None
        body, author, title, pub_date, _w = parsed
        return body, author, title, pub_date, method

    html_aio, _err = await fetch_html_aiohttp(url, timeout_s=float(s.hub_http_timeout_seconds))
    r = _try_html(html_aio, "http_aiohttp")
    if r:
        b, au, ti, pd, m = r
        return b, au, ti, pd, m, attempts

    timeout_curl = float(s.hub_curl_timeout_seconds)
    html_curl, _err_c, _diag = await asyncio.to_thread(
        _fetch_html_curl_cffi_sync,
        url,
        timeout_curl,
    )
    r = _try_html(html_curl, "curl_cffi")
    if r:
        b, au, ti, pd, m = r
        return b, au, ti, pd, m, attempts

    if not PLAYWRIGHT_AVAILABLE or pw is None:
        logger.debug(
            "enhanced_scraper.no_playwright",
            url=url[:120],
            attempts=attempts,
        )
        return None, None, None, None, last_method, attempts

    lock = pw_lock or asyncio.Lock()
    async with lock:
        if not pw.started and not getattr(pw, "_start_failed", False):
            await pw.start()

    if pw.started:
        async with lock:
            html_pw, _pw_err = await pw.fetch_html(
                url,
                wait_ms=4500,
                scroll_page=False,
                wait_until="domcontentloaded",
                timeout_ms=90000,
                block_heavy_assets=True,
            )
        r = _try_html(html_pw, "playwright_basic")
        if r:
            b, au, ti, pd, m = r
            return b, au, ti, pd, m, attempts

    if pw.started:
        async with lock:
            html_sc, _pw_err2 = await pw.fetch_html(
                url,
                wait_ms=7000,
                scroll_page=True,
                wait_until="load",
                timeout_ms=105000,
                block_heavy_assets=True,
            )
        r = _try_html(html_sc, "playwright_scroll")
        if r:
            b, au, ti, pd, m = r
            return b, au, ti, pd, m, attempts

    def _scrapling_sync() -> Optional[str]:
        try:
            from scrapling.fetchers import StealthyFetcher

            page = StealthyFetcher.fetch(
                url,
                headless=True,
                solve_cloudflare=True,
                network_idle=True,
            )
            return page.html if hasattr(page, "html") else str(page)
        except Exception:
            return None

    loop = asyncio.get_event_loop()
    html_sl = await loop.run_in_executor(None, _scrapling_sync)
    r = _try_html(html_sl, "scrapling_stealth")
    if r:
        b, au, ti, pd, m = r
        return b, au, ti, pd, m, attempts

    logger.debug(
        "enhanced_scraper.cascade_exhausted",
        url=url[:120],
        attempts=attempts,
        last_method=last_method,
    )
    return None, None, None, None, last_method, attempts
