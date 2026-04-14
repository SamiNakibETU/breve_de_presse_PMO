"""
Fetch HTTP robuste pour pages « hub » (retries, UA rotatif, fallback trafilatura).
"""

from __future__ import annotations

import asyncio
import random
import time
from typing import Any, Optional
from urllib.parse import urlparse

import aiohttp
import structlog

from src.config import get_settings
from src.services import hub_html_cache
from src.services.hub_rss import is_cloudflare_interstitial_html

logger = structlog.get_logger(__name__)


def _body_acceptable_for_hub_or_feed(ctype: str, text: str) -> bool:
    """HTML page ou flux RSS/Atom (évite non_html sur application/rss+xml)."""
    if not text or len(text) < 40:
        return False
    ct = (ctype or "").lower()
    head = text[:1200].lower()
    if "text/html" in ct or "<html" in head:
        return True
    if "application/rss+xml" in ct or "application/atom+xml" in ct:
        return True
    if "<rss" in head or "<feed" in head or "xmlns:atom" in head:
        return True
    return False


def sanitize_structlog_payload(d: dict[str, Any]) -> dict[str, Any]:
    """Évite UnicodeEncodeError sur console Windows (cp1252) lors de l'impression structlog."""
    out: dict[str, Any] = {}
    for k, v in d.items():
        if isinstance(v, str):
            out[k] = v.encode("ascii", errors="replace").decode("ascii")
        elif isinstance(v, list):
            out[k] = [
                x.encode("ascii", errors="replace").decode("ascii") if isinstance(x, str) else x
                for x in v
            ]
        else:
            out[k] = v
    return out


def _log_ex(ctx: dict[str, Any] | None, **fields: Any) -> dict[str, Any]:
    out = dict(ctx or {})
    out.update({k: v for k, v in fields.items() if v is not None})
    return sanitize_structlog_payload(out)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

BASE_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.85,fr;q=0.8,tr;q=0.7,fa;q=0.6,he;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
}

# En-têtes « navigation » — certains WAF exigent la présence des Sec-Fetch-* (comportement type Chrome).
NAV_HEADERS = {
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}


def _headers(*, referer: str | None = None) -> dict:
    h = {**BASE_HEADERS, **NAV_HEADERS, "User-Agent": random.choice(USER_AGENTS)}
    if referer:
        h["Referer"] = referer
    return h


async def fetch_html_aiohttp(
    url: str,
    *,
    timeout_s: float = 40.0,
    max_attempts: int = 3,
    log_extra: dict[str, Any] | None = None,
) -> tuple[Optional[str], str]:
    last_err = "unknown"
    timeout = aiohttp.ClientTimeout(total=timeout_s, connect=15)

    for attempt in range(max_attempts):
        # Nouvelle session par tentative pour rotation UA — TCPConnector non partagé.
        t0 = time.perf_counter()
        try:
            ref: str | None = None
            if attempt >= 1:
                try:
                    p = urlparse(url)
                    if p.scheme and p.netloc:
                        ref = f"{p.scheme}://{p.netloc}/"
                except Exception:
                    ref = None
            hdr = _headers(referer=ref)
            async with aiohttp.ClientSession(headers=hdr) as http:
                async with http.get(
                    url,
                    timeout=timeout,
                    allow_redirects=True,
                    max_redirects=8,
                ) as resp:
                    ctype0 = (resp.headers.get("Content-Type") or "").lower()
                    if resp.status == 403:
                        last_err = "http_403"
                        await resp.read()
                        logger.debug(
                            "hub_fetch.aiohttp_attempt",
                            **_log_ex(
                                log_extra,
                                stage="aiohttp",
                                attempt=attempt + 1,
                                http_status=resp.status,
                                content_type=ctype0[:120],
                                html_len=0,
                                body_bytes=0,
                                cf_interstitial=False,
                                elapsed_ms=int((time.perf_counter() - t0) * 1000),
                                error_code="http_403",
                                url=url[:160],
                            ),
                        )
                        if attempt + 1 < max_attempts:
                            await asyncio.sleep(2 ** attempt + random.uniform(0, 1))
                        continue
                    if resp.status == 429:
                        last_err = "http_429"
                        await resp.read()
                        logger.debug(
                            "hub_fetch.aiohttp_attempt",
                            **_log_ex(
                                log_extra,
                                stage="aiohttp",
                                attempt=attempt + 1,
                                http_status=resp.status,
                                content_type=ctype0[:120],
                                html_len=0,
                                body_bytes=0,
                                cf_interstitial=False,
                                elapsed_ms=int((time.perf_counter() - t0) * 1000),
                                error_code="http_429",
                                url=url[:160],
                            ),
                        )
                        await asyncio.sleep(5 + attempt * 3)
                        continue
                    if resp.status >= 400:
                        await resp.read()
                        ec = f"http_{resp.status}"
                        logger.debug(
                            "hub_fetch.aiohttp_attempt",
                            **_log_ex(
                                log_extra,
                                stage="aiohttp",
                                attempt=attempt + 1,
                                http_status=resp.status,
                                content_type=ctype0[:120],
                                html_len=0,
                                body_bytes=0,
                                cf_interstitial=False,
                                elapsed_ms=int((time.perf_counter() - t0) * 1000),
                                error_code=ec,
                                url=url[:160],
                            ),
                        )
                        return None, ec
                    ctype = (resp.headers.get("Content-Type") or "").lower()
                    text = await resp.text()
                    elapsed_ms = int((time.perf_counter() - t0) * 1000)
                    bbytes = len(text.encode("utf-8", errors="replace")) if text else 0
                    cf = bool(text and is_cloudflare_interstitial_html(text))
                    if not _body_acceptable_for_hub_or_feed(ctype, text):
                        logger.debug(
                            "hub_fetch.aiohttp_attempt",
                            **_log_ex(
                                log_extra,
                                stage="aiohttp",
                                attempt=attempt + 1,
                                http_status=resp.status,
                                content_type=ctype[:120],
                                html_len=len(text),
                                body_bytes=bbytes,
                                cf_interstitial=cf,
                                elapsed_ms=elapsed_ms,
                                error_code=f"non_html:{ctype[:50]}",
                                url=url[:160],
                            ),
                        )
                        return None, f"non_html:{ctype[:50]}"
                    if len(text) < 400:
                        last_err = "body_too_small"
                        logger.debug(
                            "hub_fetch.aiohttp_attempt",
                            **_log_ex(
                                log_extra,
                                stage="aiohttp",
                                attempt=attempt + 1,
                                http_status=resp.status,
                                content_type=ctype[:120],
                                html_len=len(text),
                                body_bytes=bbytes,
                                cf_interstitial=cf,
                                elapsed_ms=elapsed_ms,
                                error_code="body_too_small",
                                url=url[:160],
                            ),
                        )
                        if attempt + 1 < max_attempts:
                            await asyncio.sleep(1.5)
                        continue
                    logger.debug(
                        "hub_fetch.aiohttp_attempt",
                        **_log_ex(
                            log_extra,
                            stage="aiohttp",
                            attempt=attempt + 1,
                            http_status=resp.status,
                            content_type=ctype[:120],
                            html_len=len(text),
                            body_bytes=bbytes,
                            cf_interstitial=cf,
                            elapsed_ms=elapsed_ms,
                            error_code="",
                            url=url[:160],
                        ),
                    )
                    return text, ""
        except asyncio.TimeoutError:
            last_err = "timeout"
            logger.debug(
                "hub_fetch.aiohttp_attempt",
                **_log_ex(
                    log_extra,
                    stage="aiohttp",
                    attempt=attempt + 1,
                    http_status=0,
                    content_type="",
                    html_len=0,
                    body_bytes=0,
                    cf_interstitial=False,
                    elapsed_ms=int((time.perf_counter() - t0) * 1000),
                    error_code="timeout",
                    url=url[:160],
                ),
            )
        except aiohttp.ClientError as e:
            last_err = f"client:{type(e).__name__}"
            logger.debug(
                "hub_fetch.aiohttp_attempt",
                **_log_ex(
                    log_extra,
                    stage="aiohttp",
                    attempt=attempt + 1,
                    http_status=0,
                    content_type="",
                    html_len=0,
                    body_bytes=0,
                    cf_interstitial=False,
                    elapsed_ms=int((time.perf_counter() - t0) * 1000),
                    error_code=last_err,
                    url=url[:160],
                ),
            )
        if attempt + 1 < max_attempts:
            await asyncio.sleep(2 ** attempt + random.uniform(0, 0.5))

    logger.debug(
        "hub_fetch.aiohttp_exhausted",
        **_log_ex(
            log_extra,
            stage="aiohttp",
            attempt=max_attempts,
            error_code=last_err,
            url=url[:160],
        ),
    )
    return None, last_err


def _fetch_html_curl_cffi_sync(
    url: str,
    timeout_s: float = 55.0,
    *,
    impersonate: str = "chrome131",
) -> tuple[Optional[str], str, dict[str, Any]]:
    """TLS/HTTP2 « navigateur » — contourne souvent Cloudflare mieux qu’aiohttp seul."""
    diag: dict[str, Any] = {
        "http_status": 0,
        "content_type": "",
        "html_len": 0,
        "body_bytes": 0,
        "cf_interstitial": False,
        "elapsed_ms": 0,
        "error_code": "",
        "impersonate": impersonate,
    }
    try:
        from curl_cffi.requests import Session
    except ImportError:
        diag["error_code"] = "curl_cffi_not_installed"
        return None, "curl_cffi_not_installed", diag

    try:
        p = urlparse(url)
        referer = f"{p.scheme}://{p.netloc}/" if p.scheme and p.netloc else None
    except Exception:
        referer = None
    headers = {
        "Accept": BASE_HEADERS["Accept"],
        "Accept-Language": BASE_HEADERS["Accept-Language"],
        "Accept-Encoding": "gzip, deflate, br",
        "Upgrade-Insecure-Requests": "1",
        **NAV_HEADERS,
    }
    if referer:
        headers["Referer"] = referer
    t0 = time.perf_counter()
    try:
        session = Session()
        resp = session.get(
            url,
            headers={**headers, "User-Agent": random.choice(USER_AGENTS)},
            impersonate=impersonate,
            timeout=timeout_s,
            allow_redirects=True,
        )
        diag["elapsed_ms"] = max(0, int((time.perf_counter() - t0) * 1000))
        diag["http_status"] = resp.status_code
        text = resp.text
        ctype = (resp.headers.get("Content-Type") or "").lower()
        diag["content_type"] = ctype[:120]
        diag["html_len"] = len(text) if text else 0
        diag["body_bytes"] = len(text.encode("utf-8", errors="replace")) if text else 0
        diag["cf_interstitial"] = bool(text and is_cloudflare_interstitial_html(text))
        if resp.status_code == 403:
            diag["error_code"] = "http_403"
            return None, "http_403", diag
        if resp.status_code >= 400:
            ec = f"http_{resp.status_code}"
            diag["error_code"] = ec
            return None, ec, diag
        if not _body_acceptable_for_hub_or_feed(ctype, text):
            ec = f"non_html:{ctype[:50]}"
            diag["error_code"] = ec
            return None, ec, diag
        if len(text) < 400:
            diag["error_code"] = "body_too_small"
            return None, "body_too_small", diag
        diag["error_code"] = ""
        return text, "", diag
    except Exception as exc:
        diag["error_code"] = f"curl_cffi:{type(exc).__name__}"
        diag["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
        return None, f"curl_cffi:{type(exc).__name__}", diag


async def fetch_html_jina_async(
    url: str,
    *,
    timeout_s: float = 30.0,
    log_extra: dict[str, Any] | None = None,
) -> tuple[Optional[str], str]:
    """Proxy Jina AI Reader (r.jina.ai) — bypass Cloudflare/geo-block sans clé API.

    Retourne le contenu au format markdown/texte brut. Utilisé comme dernier recours
    quand toutes les méthodes directes échouent.
    """
    st = get_settings()
    if not st.jina_ai_fallback_enabled:
        return None, "jina_disabled"

    t0 = time.perf_counter()
    try:
        # Construire l'URL Jina AI Reader
        clean = url.replace("https://", "").replace("http://", "")
        jina_url = f"https://r.jina.ai/https://{clean}"

        headers_jina: dict[str, str] = {
            "Accept": "text/html,text/plain,*/*",
            "User-Agent": random.choice(USER_AGENTS),
        }
        if st.jina_ai_api_key:
            headers_jina["Authorization"] = f"Bearer {st.jina_ai_api_key}"

        timeout = aiohttp.ClientTimeout(total=timeout_s, connect=15)
        async with aiohttp.ClientSession(headers=headers_jina) as http:
            async with http.get(jina_url, timeout=timeout, allow_redirects=True) as resp:
                elapsed_ms = int((time.perf_counter() - t0) * 1000)
                if resp.status >= 400:
                    ec = f"jina_http_{resp.status}"
                    logger.debug(
                        "hub_fetch.jina_attempt",
                        **_log_ex(log_extra, stage="jina", http_status=resp.status,
                                  error_code=ec, elapsed_ms=elapsed_ms, url=url[:160]),
                    )
                    return None, ec
                text = await resp.text()
                hlen = len(text) if text else 0
                if hlen < 200:
                    logger.debug(
                        "hub_fetch.jina_attempt",
                        **_log_ex(log_extra, stage="jina", http_status=resp.status,
                                  html_len=hlen, error_code="jina_empty", elapsed_ms=elapsed_ms, url=url[:160]),
                    )
                    return None, "jina_empty"
                logger.debug(
                    "hub_fetch.jina_attempt",
                    **_log_ex(log_extra, stage="jina", http_status=resp.status,
                              html_len=hlen, error_code="", elapsed_ms=elapsed_ms, url=url[:160]),
                )
                return text, ""
    except asyncio.TimeoutError:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.debug(
            "hub_fetch.jina_attempt",
            **_log_ex(log_extra, stage="jina", http_status=0,
                      error_code="jina_timeout", elapsed_ms=elapsed_ms, url=url[:160]),
        )
        return None, "jina_timeout"
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        ec = f"jina:{type(exc).__name__}"
        logger.debug(
            "hub_fetch.jina_attempt",
            **_log_ex(log_extra, stage="jina", http_status=0,
                      error_code=ec, elapsed_ms=elapsed_ms, url=url[:160]),
        )
        return None, ec


async def fetch_html_wayback_async(
    url: str,
    *,
    timeout_s: float = 25.0,
    log_extra: dict[str, Any] | None = None,
) -> tuple[Optional[str], str]:
    """Fetch depuis Wayback Machine (archive.org) — fallback absolu pour sources inaccessibles.

    Requête CDX pour trouver le snapshot le plus récent, puis fetch depuis l'archive.
    """
    t0 = time.perf_counter()
    try:
        cdx_url = (
            f"http://web.archive.org/cdx/search/cdx"
            f"?url={url}&output=json&limit=1&fl=timestamp&filter=statuscode:200&from=20250101"
        )
        timeout = aiohttp.ClientTimeout(total=timeout_s, connect=10)
        async with aiohttp.ClientSession() as session:
            async with session.get(cdx_url, timeout=timeout) as resp:
                if resp.status != 200:
                    return None, f"wayback_cdx_http_{resp.status}"
                results = await resp.json(content_type=None)

        if not results or len(results) < 2:
            return None, "wayback_no_snapshot"

        timestamp = results[1][0]
        archive_url = f"http://web.archive.org/web/{timestamp}/{url}"

        async with aiohttp.ClientSession() as session:
            async with session.get(archive_url, timeout=timeout, allow_redirects=True) as resp2:
                elapsed_ms = int((time.perf_counter() - t0) * 1000)
                if resp2.status != 200:
                    return None, f"wayback_fetch_http_{resp2.status}"
                text = await resp2.text()
                hlen = len(text) if text else 0
                if hlen < 400:
                    return None, "wayback_body_too_small"
                logger.debug(
                    "hub_fetch.wayback_ok",
                    **_log_ex(log_extra, stage="wayback", url=url[:160],
                              html_len=hlen, elapsed_ms=elapsed_ms, error_code=""),
                )
                return text, ""
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        ec = f"wayback:{type(exc).__name__}"
        logger.debug(
            "hub_fetch.wayback_attempt",
            **_log_ex(log_extra, stage="wayback", url=url[:160],
                      elapsed_ms=elapsed_ms, error_code=ec),
        )
        return None, ec


async def fetch_html_trafilatura_thread(
    url: str,
    *,
    log_extra: dict[str, Any] | None = None,
) -> tuple[Optional[str], str]:
    t0 = time.perf_counter()
    try:
        import trafilatura.downloads

        def _dl() -> Optional[str]:
            try:
                return trafilatura.downloads.fetch_url(url, no_ssl=False)
            except Exception:
                return None

        html = await asyncio.to_thread(_dl)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        hlen = len(html) if html else 0
        cf = bool(html and is_cloudflare_interstitial_html(html))
        if html and len(html) >= 400:
            logger.debug(
                "hub_fetch.trafilatura_attempt",
                **_log_ex(
                    log_extra,
                    stage="trafilatura",
                    attempt=1,
                    http_status=0,
                    content_type="",
                    html_len=hlen,
                    body_bytes=len(html.encode("utf-8", errors="replace")),
                    cf_interstitial=cf,
                    elapsed_ms=elapsed_ms,
                    error_code="",
                    url=url[:160],
                ),
            )
            return html, ""
        ec = "trafilatura_fetch_empty"
        logger.debug(
            "hub_fetch.trafilatura_attempt",
            **_log_ex(
                log_extra,
                stage="trafilatura",
                attempt=1,
                http_status=0,
                content_type="",
                html_len=hlen,
                body_bytes=len(html.encode("utf-8", errors="replace")) if html else 0,
                cf_interstitial=cf,
                elapsed_ms=elapsed_ms,
                error_code=ec,
                url=url[:160],
            ),
        )
        return None, ec
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        ec = f"trafilatura:{type(exc).__name__}"
        logger.debug(
            "hub_fetch.trafilatura_attempt",
            **_log_ex(
                log_extra,
                stage="trafilatura",
                attempt=1,
                http_status=0,
                content_type="",
                html_len=0,
                body_bytes=0,
                cf_interstitial=False,
                elapsed_ms=elapsed_ms,
                error_code=ec,
                url=url[:160],
            ),
        )
        return None, ec


async def fetch_html_robust(
    url: str,
    *,
    timeout_s: float | None = None,
    try_trafilatura_fallback: bool = True,
    log_extra: dict[str, Any] | None = None,
) -> tuple[Optional[str], str]:
    st = get_settings()
    effective_timeout = float(timeout_s) if timeout_s is not None else float(st.hub_http_timeout_seconds)
    cached = hub_html_cache.cache_get(url)
    if cached:
        logger.debug(
            "hub_fetch.cache_hit",
            **_log_ex(
                log_extra,
                stage="cache",
                url=url[:160],
                html_len=len(cached),
                body_bytes=len(cached.encode("utf-8", errors="replace")),
                cf_interstitial=is_cloudflare_interstitial_html(cached),
                error_code="",
            ),
        )
        return cached, ""

    html, err = await fetch_html_aiohttp(
        url,
        timeout_s=effective_timeout,
        max_attempts=st.hub_http_max_attempts,
        log_extra=log_extra,
    )
    if html:
        hub_html_cache.cache_set(url, html)
        return html, ""

    curl_timeout = float(st.hub_curl_timeout_seconds)
    curl_profiles = ("chrome136", "chrome131", "chrome124", "chrome120", "edge101")
    html_cf: Optional[str] = None
    err_cf = ""
    curl_diag: dict[str, Any] = {}
    for ci, imp in enumerate(curl_profiles):
        cand, err_cf, curl_diag = await asyncio.to_thread(
            _fetch_html_curl_cffi_sync,
            url,
            curl_timeout,
            impersonate=imp,
        )
        logger.debug(
            "hub_fetch.curl_cffi_result",
            **_log_ex(
                log_extra,
                stage="curl_cffi",
                attempt=ci + 1,
                http_status=curl_diag.get("http_status", 0),
                content_type=(curl_diag.get("content_type") or "")[:120],
                html_len=curl_diag.get("html_len", 0),
                body_bytes=curl_diag.get("body_bytes", 0),
                cf_interstitial=bool(curl_diag.get("cf_interstitial")),
                elapsed_ms=curl_diag.get("elapsed_ms", 0),
                error_code=(curl_diag.get("error_code") or err_cf)[:80],
                url=url[:160],
                after_aiohttp=err[:80] if err else "",
                impersonate=str(curl_diag.get("impersonate") or imp)[:24],
            ),
        )
        if cand and not is_cloudflare_interstitial_html(cand):
            html_cf = cand
            break
        html_cf = None

    if html_cf:
        logger.info(
            "hub_fetch.curl_cffi_ok",
            **_log_ex(log_extra, url=url[:120], after_aiohttp=err[:120] if err else ""),
        )
        hub_html_cache.cache_set(url, html_cf)
        return html_cf, ""
    if try_trafilatura_fallback:
        html2, err2 = await fetch_html_trafilatura_thread(url, log_extra=log_extra)
        if html2:
            logger.info(
                "hub_fetch.trafilatura_ok",
                **_log_ex(log_extra, url=url[:120], after_aiohttp=err[:120] if err else ""),
            )
            hub_html_cache.cache_set(url, html2)
            return html2, ""

        # Dernier recours : Jina AI Reader (bypass Cloudflare / geo-block)
        html_jina, err_jina = await fetch_html_jina_async(url, log_extra=log_extra)
        if html_jina:
            logger.info(
                "hub_fetch.jina_ok",
                **_log_ex(log_extra, url=url[:120], after_aiohttp=err[:120] if err else ""),
            )
            hub_html_cache.cache_set(url, html_jina)
            return html_jina, ""
        # Fallback ultime : Wayback Machine (archive.org)
        html_wb, err_wb = await fetch_html_wayback_async(url, log_extra=log_extra)
        if html_wb:
            logger.info(
                "hub_fetch.wayback_fallback_ok",
                **_log_ex(log_extra, url=url[:120], after_aiohttp=err[:120] if err else ""),
            )
            hub_html_cache.cache_set(url, html_wb)
            return html_wb, ""
        return None, f"{err}|cffi:{err_cf}|tf:{err2}|jina:{err_jina}|wb:{err_wb}"
    return None, f"{err}|cffi:{err_cf}"
