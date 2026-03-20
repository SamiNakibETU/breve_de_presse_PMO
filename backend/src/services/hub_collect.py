"""
Stratégies combinées : RSS (contourne souvent Cloudflare) + HTTP + Playwright + extraction.
Utilisé par opinion_hub_scraper et validate_media_hubs.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

import structlog

from src.services.hub_fetch import fetch_html_robust
from src.services.hub_links import extract_hub_article_links
from src.services.hub_playwright import HubPlaywrightBrowser, PLAYWRIGHT_AVAILABLE
from src.services.hub_rss import (
    body_looks_like_rss_or_atom,
    extract_article_links_from_feed_body,
    is_cloudflare_interstitial_html,
)
from src.services.opinion_hub_overrides import merge_hub_override

logger = structlog.get_logger(__name__)


def _extract_kwargs(override: dict[str, Any]) -> dict[str, Any]:
    return {
        "link_pattern": override.get("link_pattern") or None,
        "link_selector": override.get("link_selector") or None,
        "relaxed_same_site": bool(override.get("relaxed_same_site")),
        "strict_link_pattern": bool(override.get("strict_link_pattern")),
    }


def _rss_feed_candidates(override: dict[str, Any]) -> list[str]:
    """rss_feed_url + rss_feed_urls (fallbacks si le premier flux est vide ou bloqué)."""
    out: list[str] = []
    main = override.get("rss_feed_url")
    if isinstance(main, str) and main.strip():
        out.append(main.strip())
    extra = override.get("rss_feed_urls")
    if isinstance(extra, list):
        for u in extra:
            if isinstance(u, str) and u.strip():
                out.append(u.strip())
    return list(dict.fromkeys(out))


async def fetch_html_and_extract_hub_links(
    hub_url: str,
    source_id: str,
    *,
    max_links: int = 40,
    min_links: int = 3,
    pw: HubPlaywrightBrowser | None = None,
    pw_lock: asyncio.Lock | None = None,
) -> tuple[list[str], dict[str, Any]]:
    """
    Retourne (liens_article, meta) avec meta : fetch_ok, fetch_error, strategy, html_len.
    Ordre : flux RSS dédié (si configuré) → HTTP → Playwright.
    Les pages « Cloudflare challenge » (HTML trompeur) sont ignorées.
    """
    override = merge_hub_override(source_id, hub_url)
    ex_kw = _extract_kwargs(override)
    want_playwright = bool(override.get("playwright"))
    wait_ms = int(override.get("wait_ms") or 4500)
    scroll_page = bool(override.get("scroll_page"))
    wait_until = str(override.get("wait_until") or "domcontentloaded")
    pw_timeout_ms = int(override.get("playwright_timeout_ms") or 90000)
    wait_for_selector = override.get("wait_for_selector") or None
    if isinstance(wait_for_selector, str) and not wait_for_selector.strip():
        wait_for_selector = None

    rss_candidates = _rss_feed_candidates(override)
    rss_filter = override.get("rss_link_filter")
    if not isinstance(rss_filter, str) or not rss_filter.strip():
        rss_filter = None

    meta: dict[str, Any] = {
        "fetch_ok": False,
        "fetch_error": "",
        "strategy": "",
        "html_len": 0,
        "override_playwright": want_playwright,
    }

    ordered: list[str] = []
    seen: set[str] = set()

    def _add_urls(urls: list[str]) -> None:
        nonlocal ordered
        for u in urls:
            if not u or u in seen:
                continue
            seen.add(u)
            ordered.append(u)
            if len(ordered) >= max_links:
                return

    strategies: list[str] = []
    best_err = ""
    last_html_len = 0

    # --- 1) RSS (souvent accessible alors que le HTML est derrière CF) ---
    rss_strategy_added = False
    for rss_url in rss_candidates:
        if len(ordered) >= max_links:
            break
        rb, rerr = await fetch_html_robust(rss_url, try_trafilatura_fallback=True)
        if rb and body_looks_like_rss_or_atom(rb):
            rss_links = extract_article_links_from_feed_body(
                rb,
                max_links,
                link_must_contain=rss_filter,
            )
            n_before = len(ordered)
            _add_urls(rss_links)
            last_html_len = max(last_html_len, len(rb))
            if not rss_strategy_added and len(ordered) > n_before:
                strategies.append("rss")
                rss_strategy_added = True
            logger.info(
                "hub_collect.rss_ok",
                source=source_id,
                url=rss_url[:80],
                n=len(rss_links),
                merged=len(ordered),
            )
        elif rb:
            best_err = (best_err + f"|rss_not_xml:{rss_url[:40]}").strip("|")
        else:
            best_err = (best_err + f"|rss:{rerr}:{rss_url[:40]}").strip("|")

    # --- 2) HTML hub (aiohttp → curl_cffi → trafilatura) ---
    html, err = await fetch_html_robust(hub_url, try_trafilatura_fallback=True)
    if html and is_cloudflare_interstitial_html(html):
        logger.info("hub_collect.html_cloudflare_skip", source=source_id, url=hub_url[:80])
        html = None
        err = (err or "ok") + "|cloudflare_interstitial"
    if html:
        strategies.append("aiohttp")
        last_html_len = max(last_html_len, len(html))
        _add_urls(extract_hub_article_links(html, hub_url, max_links=max_links, **ex_kw))
    else:
        best_err = (best_err + f"|{err}").strip("|")

    # --- 3) Playwright ---
    need_pw = (
        PLAYWRIGHT_AVAILABLE
        and pw is not None
        and (
            want_playwright
            or not html
            or len(ordered) < min_links
        )
    )

    if need_pw:
        lock = pw_lock or asyncio.Lock()
        html2: Optional[str] = None
        err2 = ""
        async with lock:
            if not pw.started and not getattr(pw, "_start_failed", False):
                ok = await pw.start()
                if not ok and not ordered and not html:
                    meta["fetch_error"] = best_err or "playwright_start_failed"
                    return [], meta
                if not ok:
                    best_err = (best_err + "|playwright_unavailable").strip("|")
            if pw.started:
                html2, err2 = await pw.fetch_html(
                    hub_url,
                    wait_ms=wait_ms,
                    scroll_page=scroll_page,
                    wait_until=wait_until,
                    timeout_ms=pw_timeout_ms,
                    wait_for_selector=wait_for_selector,
                )
        if html2 and is_cloudflare_interstitial_html(html2):
            logger.info("hub_collect.pw_cloudflare_skip", source=source_id, url=hub_url[:80])
            html2 = None
            err2 = "cloudflare_interstitial"
        if html2:
            strategies.append("playwright")
            last_html_len = max(last_html_len, len(html2))
            _add_urls(
                extract_hub_article_links(html2, hub_url, max_links=max_links, **ex_kw),
            )
        elif not html and not ordered:
            best_err = (best_err + f"|pw:{err2}").strip("|")

    meta["strategy"] = "+".join(strategies) if strategies else ""
    meta["html_len"] = last_html_len
    meta["link_count"] = len(ordered)

    if not ordered:
        meta["fetch_error"] = best_err or "no_links"
        return [], meta

    meta["fetch_ok"] = True
    if len(ordered) < min_links:
        meta["fetch_error"] = f"|links_below_{min_links}"
    return ordered, meta
