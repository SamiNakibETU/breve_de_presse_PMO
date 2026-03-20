"""
Fetch HTTP robuste pour pages « hub » (retries, UA rotatif, fallback trafilatura).
"""

from __future__ import annotations

import asyncio
import random
from typing import Optional

import aiohttp
import structlog

from src.services import hub_html_cache

logger = structlog.get_logger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]

BASE_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.85,fr;q=0.8,tr;q=0.7,fa;q=0.6,he;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
}


def _headers() -> dict:
    return {**BASE_HEADERS, "User-Agent": random.choice(USER_AGENTS)}


async def fetch_html_aiohttp(
    url: str,
    *,
    timeout_s: float = 40.0,
    max_attempts: int = 3,
) -> tuple[Optional[str], str]:
    last_err = "unknown"
    timeout = aiohttp.ClientTimeout(total=timeout_s, connect=15)

    for attempt in range(max_attempts):
        # Une session par tentative (UA rotatif) — ne pas réutiliser un TCPConnector fermé.
        try:
            async with aiohttp.ClientSession(headers=_headers()) as http:
                async with http.get(
                    url,
                    timeout=timeout,
                    allow_redirects=True,
                    max_redirects=8,
                ) as resp:
                    if resp.status == 403:
                        last_err = "http_403"
                        await resp.read()
                        if attempt + 1 < max_attempts:
                            await asyncio.sleep(2 ** attempt + random.uniform(0, 1))
                        continue
                    if resp.status == 429:
                        last_err = "http_429"
                        await resp.read()
                        await asyncio.sleep(5 + attempt * 3)
                        continue
                    if resp.status >= 400:
                        await resp.read()
                        return None, f"http_{resp.status}"
                    ctype = (resp.headers.get("Content-Type") or "").lower()
                    text = await resp.text()
                    if "text/html" not in ctype and "<html" not in text[:800].lower():
                        return None, f"non_html:{ctype[:50]}"
                    if len(text) < 400:
                        last_err = "body_too_small"
                        if attempt + 1 < max_attempts:
                            await asyncio.sleep(1.5)
                        continue
                    return text, ""
        except asyncio.TimeoutError:
            last_err = "timeout"
        except aiohttp.ClientError as e:
            last_err = f"client:{type(e).__name__}"
        if attempt + 1 < max_attempts:
            await asyncio.sleep(2 ** attempt + random.uniform(0, 0.5))

    return None, last_err


def _fetch_html_curl_cffi_sync(url: str) -> tuple[Optional[str], str]:
    """TLS/HTTP2 « navigateur » — contourne souvent Cloudflare mieux qu’aiohttp seul."""
    try:
        from curl_cffi.requests import Session
    except ImportError:
        return None, "curl_cffi_not_installed"

    headers = {
        "Accept": BASE_HEADERS["Accept"],
        "Accept-Language": BASE_HEADERS["Accept-Language"],
        "Upgrade-Insecure-Requests": "1",
    }
    try:
        session = Session()
        resp = session.get(
            url,
            headers={**headers, "User-Agent": random.choice(USER_AGENTS)},
            impersonate="chrome131",
            timeout=45,
            allow_redirects=True,
        )
        if resp.status_code == 403:
            return None, "http_403"
        if resp.status_code >= 400:
            return None, f"http_{resp.status_code}"
        text = resp.text
        ctype = (resp.headers.get("Content-Type") or "").lower()
        if "text/html" not in ctype and "<html" not in text[:800].lower():
            return None, f"non_html:{ctype[:50]}"
        if len(text) < 400:
            return None, "body_too_small"
        return text, ""
    except Exception as exc:
        return None, f"curl_cffi:{type(exc).__name__}"


async def fetch_html_trafilatura_thread(url: str) -> tuple[Optional[str], str]:
    try:
        import trafilatura.downloads

        def _dl() -> Optional[str]:
            try:
                return trafilatura.downloads.fetch_url(url, no_ssl=False)
            except Exception:
                return None

        html = await asyncio.to_thread(_dl)
        if html and len(html) >= 400:
            return html, ""
        return None, "trafilatura_fetch_empty"
    except Exception as exc:
        return None, f"trafilatura:{type(exc).__name__}"


async def fetch_html_robust(
    url: str,
    *,
    timeout_s: float = 40.0,
    try_trafilatura_fallback: bool = True,
) -> tuple[Optional[str], str]:
    cached = hub_html_cache.cache_get(url)
    if cached:
        return cached, ""

    html, err = await fetch_html_aiohttp(url, timeout_s=timeout_s)
    if html:
        hub_html_cache.cache_set(url, html)
        return html, ""
    html_cf, err_cf = await asyncio.to_thread(_fetch_html_curl_cffi_sync, url)
    if html_cf:
        logger.info("hub_fetch.curl_cffi_ok", url=url[:80], after_aiohttp=err)
        hub_html_cache.cache_set(url, html_cf)
        return html_cf, ""
    if try_trafilatura_fallback:
        html2, err2 = await fetch_html_trafilatura_thread(url)
        if html2:
            logger.info("hub_fetch.trafilatura_ok", url=url[:80], after_aiohttp=err)
            hub_html_cache.cache_set(url, html2)
            return html2, ""
        return None, f"{err}|cffi:{err_cf}|tf:{err2}"
    return None, f"{err}|cffi:{err_cf}"
