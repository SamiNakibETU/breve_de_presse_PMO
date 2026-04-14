"""
Stratégies combinées : RSS → Jina AI primary (si configuré) → HTTP → Playwright → Jina AI → Wayback.
Utilisé par opinion_hub_scraper et validate_media_hubs.
"""

from __future__ import annotations

import asyncio
import random
import re
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

import structlog

from src.config import get_settings
from src.services.hub_fetch import (
    fetch_html_robust,
    fetch_html_jina_async,
    fetch_html_wayback_async,
    sanitize_structlog_payload,
)
from src.services.hub_links import extract_hub_article_links
from src.services.hub_page_diagnostics import analyze_hub_html, merge_diagnosis_priority
from src.services.hub_playwright import HubPlaywrightBrowser, PLAYWRIGHT_AVAILABLE
from src.services.hub_rss import (
    body_looks_like_rss_or_atom,
    extract_article_links_from_feed_body,
    is_cloudflare_interstitial_html,
)
from src.services.opinion_hub_overrides import merge_hub_override

logger = structlog.get_logger(__name__)

_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\((https?://[^\)]+)\)")


def _extract_links_from_jina_markdown(markdown: str, base_url: str) -> list[str]:
    """Extrait les URLs depuis le contenu Markdown retourné par Jina AI Reader.

    Jina retourne [texte](url) — BeautifulSoup ne trouve rien sur ce format.
    On extrait les URLs absolues et on filtre par domaine du hub.
    """
    base_domain = urlparse(base_url).netloc
    links: list[str] = []
    seen: set[str] = set()
    for _text, url in _MD_LINK_RE.findall(markdown):
        url = url.strip().rstrip(")")
        if not url.startswith("http"):
            try:
                url = urljoin(base_url, url)
            except Exception:
                continue
        if urlparse(url).netloc != base_domain:
            continue
        if url not in seen:
            seen.add(url)
            links.append(url)
    return links


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


def _override_keys(override: dict[str, Any]) -> list[str]:
    return sorted(
        k
        for k in override
        if isinstance(k, str) and k and not str(k).startswith("_")
    )


def _diag_snapshot(stage: str, body: str | None, page_url: str) -> dict[str, Any]:
    if not body:
        return {
            "stage": stage,
            "diagnosis_class": "thin_html",
            "signals": {"html_len": 0, "reason": "no_body"},
        }
    r = analyze_hub_html(body, page_url)
    return {"stage": stage, "diagnosis_class": r["diagnosis_class"], "signals": r["signals"]}


async def fetch_html_and_extract_hub_links(
    hub_url: str,
    source_id: str,
    *,
    max_links: int = 40,
    min_links: int = 3,
    pw: HubPlaywrightBrowser | None = None,
    pw_lock: asyncio.Lock | None = None,
    batch_id: str | None = None,
) -> tuple[list[str], dict[str, Any]]:
    """
    Retourne (liens_article, meta) avec meta : fetch_ok, fetch_error, strategy, html_len.
    Ordre : flux RSS dédié (si configuré) → HTTP → Playwright.
    Les pages « Cloudflare challenge » (HTML trompeur) sont ignorées.
    """
    override = merge_hub_override(source_id, hub_url)
    hub_settings = get_settings()
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
    rss_exclude_raw = override.get("rss_link_exclude")
    rss_exclude_list: list[str] = []
    if isinstance(rss_exclude_raw, str) and rss_exclude_raw.strip():
        rss_exclude_list.append(rss_exclude_raw.strip().lower())
    elif isinstance(rss_exclude_raw, list):
        for x in rss_exclude_raw:
            if isinstance(x, str) and x.strip():
                rss_exclude_list.append(x.strip().lower())

    override_key_list = _override_keys(override)
    diag_classes: list[str] = []
    page_diagnostics: list[dict[str, Any]] = []

    def _fetch_log_extra(fetch_role: str, rss_feed_url: str | None = None) -> dict[str, Any]:
        ex: dict[str, Any] = {
            "source_id": source_id,
            "hub_url": hub_url[:200],
            "fetch_role": fetch_role,
            "override_keys": override_key_list,
        }
        if batch_id:
            ex["batch_id"] = batch_id
        if rss_feed_url:
            ex["rss_feed_url"] = rss_feed_url[:120]
        return ex

    def _log(ev: str, **kw: Any) -> None:
        payload = {
            "source_id": source_id,
            "hub_url": hub_url[:200],
            "override_keys": override_key_list,
            "stage": kw.pop("stage", ev),
            **kw,
        }
        if batch_id:
            payload["batch_id"] = batch_id
        logger.info(ev, **sanitize_structlog_payload(payload))

    meta: dict[str, Any] = {
        "fetch_ok": False,
        "fetch_error": "",
        "strategy": "",
        "html_len": 0,
        "override_playwright": want_playwright,
        "override_keys": override_key_list,
        "page_diagnostics": page_diagnostics,
        "diagnosis_class": "unknown",
        "batch_id": batch_id,
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
        rb, rerr = await fetch_html_robust(
            rss_url,
            try_trafilatura_fallback=True,
            log_extra=_fetch_log_extra("rss_feed", rss_url),
        )
        if rb and body_looks_like_rss_or_atom(rb):
            rss_cap = min(180, max(max_links * 5, max_links))
            rss_links = extract_article_links_from_feed_body(
                rb,
                rss_cap,
                link_must_contain=rss_filter,
            )
            for sub in rss_exclude_list:
                rss_links = [u for u in rss_links if sub not in u.lower()]
            n_before = len(ordered)
            _add_urls(rss_links)
            last_html_len = max(last_html_len, len(rb))
            if not rss_strategy_added and len(ordered) > n_before:
                strategies.append("rss")
                rss_strategy_added = True
            _log(
                "hub_collect.rss_ok",
                stage="rss",
                rss_url=rss_url[:120],
                n=len(rss_links),
                merged=len(ordered),
                error_code="",
            )
        elif rb:
            best_err = (best_err + f"|rss_not_xml:{rss_url[:40]}").strip("|")
        else:
            best_err = (best_err + f"|rss:{rerr}:{rss_url[:40]}").strip("|")

    if hub_settings.hub_between_strategy_jitter_seconds > 0:
        await asyncio.sleep(
            random.uniform(0.0, float(hub_settings.hub_between_strategy_jitter_seconds)),
        )

    # --- 1b) Jina AI PRIMARY (sources bloquées : al-Sabah Irak, Al Ghad...) ---
    jina_primary = bool(override.get("jina_ai_primary"))
    if jina_primary and len(ordered) < min_links:
        html_jp, err_jp = await fetch_html_jina_async(
            hub_url, log_extra=_fetch_log_extra("jina_primary")
        )
        if html_jp:
            strategies.append("jina_primary")
            last_html_len = max(last_html_len, len(html_jp))
            # Jina retourne du Markdown : extraire les liens MD ET les liens HTML
            md_links = _extract_links_from_jina_markdown(html_jp, hub_url)
            html_links = extract_hub_article_links(html_jp, hub_url, max_links=max_links, **ex_kw)
            _add_urls(md_links + html_links)
            _log(
                "hub_collect.jina_primary_ok",
                stage="jina_primary",
                html_len=len(html_jp),
                md_links=len(md_links),
                html_links=len(html_links),
                link_candidates=len(ordered),
                error_code="",
            )
        else:
            best_err = (best_err + f"|jina_primary:{err_jp}").strip("|")

    # --- 2) HTML hub (aiohttp → curl_cffi → trafilatura) ---
    html, err = await fetch_html_robust(
        hub_url,
        try_trafilatura_fallback=True,
        log_extra=_fetch_log_extra("hub_html"),
    )
    if html and is_cloudflare_interstitial_html(html):
        snap = _diag_snapshot("http_cloudflare_rejected", html, hub_url)
        page_diagnostics.append(snap)
        diag_classes.append(snap["diagnosis_class"])
        _log(
            "hub_collect.html_cloudflare_skip",
            stage="http",
            error_code="cloudflare_interstitial",
            html_len=len(html),
            diagnosis_class=snap["diagnosis_class"],
        )
        html = None
        err = (err or "ok") + "|cloudflare_interstitial"
    if html:
        snap = _diag_snapshot("http", html, hub_url)
        page_diagnostics.append(snap)
        diag_classes.append(snap["diagnosis_class"])
        strategies.append("aiohttp")
        last_html_len = max(last_html_len, len(html))
        _add_urls(extract_hub_article_links(html, hub_url, max_links=max_links, **ex_kw))
        _log(
            "hub_collect.http_html_ok",
            stage="http",
            html_len=len(html),
            diagnosis_class=snap["diagnosis_class"],
            link_candidates=len(ordered),
            error_code="",
        )
    else:
        best_err = (best_err + f"|{err}").strip("|")
        if err:
            ec = err.split("|")[0][:80]
            if "cloudflare_interstitial" in err:
                ec = "cloudflare_interstitial"
            _log(
                "hub_collect.http_failed",
                stage="http",
                error_code=ec,
            )

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
                    meta["diagnosis_class"] = merge_diagnosis_priority(diag_classes)
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
                    log_extra=_fetch_log_extra("hub_playwright"),
                )
                if (
                    html2
                    and is_cloudflare_interstitial_html(html2)
                    and hub_settings.hub_playwright_cf_relaxed_retry
                ):
                    html2, err2 = await pw.fetch_html(
                        hub_url,
                        wait_ms=min(wait_ms + 5000, 22000),
                        scroll_page=True,
                        wait_until="load",
                        timeout_ms=min(pw_timeout_ms + 20000, 120000),
                        wait_for_selector=wait_for_selector,
                        log_extra=_fetch_log_extra("hub_playwright_retry"),
                    )
        if html2 and is_cloudflare_interstitial_html(html2):
            snap = _diag_snapshot("playwright_cloudflare_rejected", html2, hub_url)
            page_diagnostics.append(snap)
            diag_classes.append(snap["diagnosis_class"])
            _log(
                "hub_collect.pw_cloudflare_skip",
                stage="playwright",
                error_code="cloudflare_interstitial",
                html_len=len(html2),
                diagnosis_class=snap["diagnosis_class"],
            )
            html2 = None
            err2 = "cloudflare_interstitial"
        if html2:
            snap = _diag_snapshot("playwright", html2, hub_url)
            page_diagnostics.append(snap)
            diag_classes.append(snap["diagnosis_class"])
            strategies.append("playwright")
            last_html_len = max(last_html_len, len(html2))
            _add_urls(
                extract_hub_article_links(html2, hub_url, max_links=max_links, **ex_kw),
            )
            _log(
                "hub_collect.playwright_html_ok",
                stage="playwright",
                html_len=len(html2),
                diagnosis_class=snap["diagnosis_class"],
                link_candidates=len(ordered),
                error_code="",
            )
        elif not html and not ordered:
            best_err = (best_err + f"|pw:{err2}").strip("|")
            if err2:
                _log(
                    "hub_collect.playwright_failed",
                    stage="playwright",
                    error_code=(err2 or "pw_error")[:120],
                )

    meta["strategy"] = "+".join(strategies) if strategies else ""
    meta["html_len"] = last_html_len
    meta["link_count"] = len(ordered)
    meta["page_diagnostics"] = page_diagnostics
    meta["diagnosis_class"] = merge_diagnosis_priority(diag_classes) if diag_classes else "unknown"
    if meta["strategy"] == "rss" and ordered:
        meta["diagnosis_class"] = "rss_feed"

    if not ordered:
        meta["fetch_error"] = best_err or "no_links"
        return [], meta

    meta["fetch_ok"] = True
    if len(ordered) < min_links:
        meta["fetch_error"] = f"|links_below_{min_links}"
    return ordered, meta
