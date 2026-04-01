"""
Ultra Scraper V3 — fetch multi-strategies, decouverte hub, articles unitaires.
"""
from __future__ import annotations

import asyncio
import logging
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from core.final.smart_content import (
    extract_main_text,
    filter_article_urls,
    is_cloudflare_challenge,
)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

_CF_HOSTS = ("alwatannews.net", "alsabaah.iq")


@dataclass
class ScrapeResult:
    success: bool
    url: str
    method: str
    title: Optional[str] = None
    author: Optional[str] = None
    date: Optional[str] = None
    content: Optional[str] = None
    word_count: int = 0
    html_size: int = 0
    error: Optional[str] = None
    timestamp: str = ""
    site_name: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class UltraScraperV3:
    """Cascade HTTP / curl / Playwright / Selenium fichier / Scrapling."""

    def __init__(self, min_words: int = 200, verbose: bool = True) -> None:
        self.min_words = min_words
        self.verbose = verbose
        self.stats: Dict[str, Any] = {
            "total": 0,
            "success": 0,
            "failed": 0,
            "by_method": {},
            "errors": [],
        }

    def _log(self, msg: str) -> None:
        if self.verbose:
            logger.info(msg.encode("ascii", "ignore").decode("ascii"))

    def _result_from_html(self, html: str, url: str, method: str) -> ScrapeResult:
        text, title, words = extract_main_text(html, url)
        return ScrapeResult(
            success=words >= self.min_words,
            url=url,
            method=method,
            title=title,
            content=(text[:12000] if text else None),
            word_count=words,
            html_size=len(html),
        )

    def _is_cf_site(self, url: str) -> bool:
        h = url.lower()
        return any(x in h for x in _CF_HOSTS)

    def _hub_aggregate_eligible(self, url: str) -> bool:
        host = url.lower()
        path = urlparse(url).path
        if "haaretz.com" in host and re.match(r"^/opinion/?$", path) is not None:
            return True
        if "israelhayom.com" in host and re.match(r"^/?$", path) is not None:
            return True
        return False

    def _method_chain(
        self, url: str, *, include_hub_aggregate: bool
    ) -> List[Tuple[str, Callable[[str], Awaitable[Optional[ScrapeResult]]]]]:
        host = url.lower()
        methods: List[Tuple[str, Callable[[str], Awaitable[Optional[ScrapeResult]]]]] = []

        if include_hub_aggregate and self._hub_aggregate_eligible(url):
            methods.append(("hub_opinion_aggregate", self._hub_opinion_aggregate))

        if self._is_cf_site(url):
            methods.extend(
                [
                    ("playwright_cf_wait", self._playwright_cf_wait),
                    ("selenium_uc_file", self._selenium_uc_file),
                    ("curl_cffi", self._curl_cffi),
                    ("http_simple", self._http_simple),
                ]
            )
        else:
            methods.extend(
                [
                    ("http_simple", self._http_simple),
                    ("curl_cffi", self._curl_cffi),
                    ("playwright_basic", self._playwright_basic),
                    ("playwright_scroll", self._playwright_scroll),
                    ("selenium_uc_file", self._selenium_uc_file),
                ]
            )

        methods.append(("scrapling_stealth", self._scrapling_stealth))
        return methods

    async def _run_chain(
        self,
        url: str,
        site_name: str,
        methods: List[Tuple[str, Callable[[str], Awaitable[Optional[ScrapeResult]]]]],
        *,
        count_in_stats: bool = True,
    ) -> ScrapeResult:
        for name, fn in methods:
            try:
                self._log(f"  -> {name}...")
                result = await fn(url)
                if result and result.word_count >= self.min_words:
                    self._log(f"  [OK] {name}: {result.word_count} mots")
                    result.site_name = site_name
                    if count_in_stats:
                        self.stats["success"] += 1
                        self.stats["by_method"][name] = self.stats["by_method"].get(name, 0) + 1
                    return result
                if result and result.word_count > 0:
                    self._log(f"  [LOW] {name}: {result.word_count} mots")
                else:
                    err = (result.error if result else "No result") or ""
                    self._log(f"  [FAIL] {name}: {err[:80]}")
            except Exception as e:
                self._log(f"  [ERR] {name}: {str(e)[:80]}")
                if count_in_stats:
                    self.stats["errors"].append({"method": name, "url": url, "error": str(e)[:200]})

        if count_in_stats:
            self.stats["failed"] += 1
        return ScrapeResult(
            success=False,
            url=url,
            site_name=site_name,
            method="all_failed",
            error="Toutes les methodes ont echoue",
            word_count=0,
        )

    async def scrape(self, url: str, site_name: str = "") -> ScrapeResult:
        self.stats["total"] += 1
        self._log(f"Scraping: {url[:72]}...")
        methods = self._method_chain(url, include_hub_aggregate=True)
        return await self._run_chain(url, site_name, methods, count_in_stats=True)

    async def fetch_article(
        self,
        url: str,
        site_name: str = "",
        min_words: Optional[int] = None,
        *,
        count_in_stats: bool = True,
    ) -> ScrapeResult:
        """Une page article (pas d'agregat hub)."""
        if count_in_stats:
            self.stats["total"] += 1
        saved = self.min_words
        if min_words is not None:
            self.min_words = min_words
        try:
            self._log(f"Article: {url[:72]}...")
            methods = self._method_chain(url, include_hub_aggregate=False)
            return await self._run_chain(url, site_name, methods, count_in_stats=count_in_stats)
        finally:
            self.min_words = saved

    async def _raw_http(self, url: str) -> Optional[str]:
        import requests

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        }
        r = requests.get(url, headers=headers, timeout=25)
        r.raise_for_status()
        return r.text

    async def _raw_curl(self, url: str) -> Optional[str]:
        import curl_cffi.requests as curl_requests

        session = curl_requests.Session(impersonate="chrome")
        r = session.get(url, timeout=25)
        return r.text

    async def _raw_playwright_scroll(self, url: str) -> Optional[str]:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
            page = await ctx.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=50000)
            await asyncio.sleep(2)
            for _ in range(10):
                await page.evaluate("window.scrollBy(0, 700)")
                await asyncio.sleep(0.9)
            html = await page.content()
            await browser.close()
        return html

    async def _raw_selenium(self, url: str) -> Optional[str]:
        runner = Path(__file__).resolve().parent / "selenium_fetch_to_file.py"
        if not runner.is_file():
            return None
        with tempfile.NamedTemporaryFile(mode="w", suffix=".html", delete=False, encoding="utf-8") as tmp:
            out_path = tmp.name
        try:
            proc = subprocess.run(
                [sys.executable, str(runner), out_path, url],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if proc.returncode != 0 or "OK" not in (proc.stdout or ""):
                return None
            return Path(out_path).read_text(encoding="utf-8", errors="replace")
        finally:
            try:
                Path(out_path).unlink(missing_ok=True)
            except OSError:
                pass

    async def fetch_raw_html(self, url: str) -> Tuple[Optional[str], str]:
        """HTML brut pour decouverte de liens sur hubs difficiles."""
        for name, coro in [
            ("raw_http", self._raw_http),
            ("raw_curl", self._raw_curl),
            ("raw_playwright", self._raw_playwright_scroll),
        ]:
            try:
                html = await coro(url)
                if html and len(html) > 1200 and not is_cloudflare_challenge(html):
                    return html, name
            except Exception:
                continue
        if self._is_cf_site(url):
            html = await self._raw_selenium(url)
            if html and len(html) > 1200:
                return html, "raw_selenium"
        return None, ""

    async def discover_article_links(self, hub_url: str, max_links: int = 24) -> List[str]:
        """Liens article candidats depuis le hub (DOM Playwright + repli HTML brut)."""
        from playwright.async_api import async_playwright

        hrefs: List[str] = []
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=["--disable-blink-features=AutomationControlled"],
                )
                ctx = await browser.new_context(
                    viewport={"width": 1280, "height": 900},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    ),
                )
                page = await ctx.new_page()
                await page.goto(hub_url, wait_until="domcontentloaded", timeout=55000)
                await asyncio.sleep(3)
                if self._is_cf_site(hub_url):
                    for _ in range(18):
                        html_snip = await page.content()
                        if not is_cloudflare_challenge(html_snip):
                            inner = await page.evaluate("() => document.body ? document.body.innerText.length : 0")
                            if inner > 400:
                                break
                        await asyncio.sleep(3)
                is_ih = "israelhayom.com" in hub_url.lower()
                scroll_n = 16 if is_ih else 10
                pause = 1.05 if is_ih else 0.85
                for _ in range(scroll_n):
                    await page.evaluate("window.scrollBy(0, 750)")
                    await asyncio.sleep(pause)
                if is_ih:
                    await asyncio.sleep(2.5)
                hrefs = await page.evaluate(
                    """() => {
                        const s = new Set();
                        for (const a of document.querySelectorAll('a[href]')) {
                            try { s.add(new URL(a.href, location.origin).href); } catch (e) {}
                        }
                        return [...s];
                    }"""
                )
                await browser.close()
        except Exception:
            hrefs = []

        found = filter_article_urls(hub_url, hrefs, max_urls=max_links)
        if len(found) < 3:
            html, _src = await self.fetch_raw_html(hub_url)
            if html:
                soup = BeautifulSoup(html, "lxml")
                extra: List[str] = []
                for a in soup.select("a[href]"):
                    h = a.get("href")
                    if h:
                        extra.append(h)
                merged = list(dict.fromkeys([*hrefs, *extra]))
                found = filter_article_urls(hub_url, merged, max_urls=max_links)
        return found

    async def _http_simple(self, url: str) -> Optional[ScrapeResult]:
        html = await self._raw_http(url)
        return self._result_from_html(html, url, "http_simple")

    async def _curl_cffi(self, url: str) -> Optional[ScrapeResult]:
        html = await self._raw_curl(url)
        return self._result_from_html(html, url, "curl_cffi")

    async def _playwright_basic(self, url: str) -> Optional[ScrapeResult]:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            ctx = await browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
            )
            page = await ctx.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=35000)
            await asyncio.sleep(3)
            html = await page.content()
            await browser.close()
        return self._result_from_html(html, url, "playwright_basic")

    async def _playwright_scroll(self, url: str) -> Optional[ScrapeResult]:
        html = await self._raw_playwright_scroll(url)
        return self._result_from_html(html, url, "playwright_scroll")

    async def _playwright_cf_wait(self, url: str) -> Optional[ScrapeResult]:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            ctx = await browser.new_context(
                viewport={"width": 1366, "height": 900},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
                ),
                locale="ar-BH",
            )
            page = await ctx.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            html = ""
            for _ in range(20):
                html = await page.content()
                title = (await page.title()) or ""
                inner_len = await page.evaluate("() => document.body ? document.body.innerText.length : 0")
                if not is_cloudflare_challenge(html) and inner_len > 400:
                    break
                if "moment" not in title.lower() and inner_len > 600:
                    break
                await asyncio.sleep(3)
            for _ in range(6):
                await page.evaluate("window.scrollBy(0, 700)")
                await asyncio.sleep(1.5)
            html = await page.content()
            await browser.close()

        if is_cloudflare_challenge(html):
            r = self._result_from_html(html, url, "playwright_cf_wait")
            r.success = False
            r.error = "Cloudflare challenge encore present"
            return r
        return self._result_from_html(html, url, "playwright_cf_wait")

    async def _selenium_uc_file(self, url: str) -> Optional[ScrapeResult]:
        html = await self._raw_selenium(url)
        if not html:
            return ScrapeResult(
                success=False,
                url=url,
                method="selenium_uc_file",
                error="selenium no html",
                word_count=0,
            )
        return self._result_from_html(html, url, "selenium_uc_file")

    async def _hub_opinion_aggregate(self, hub_url: str) -> Optional[ScrapeResult]:
        article_urls = await self.discover_article_links(hub_url, max_links=12)
        if not article_urls:
            return ScrapeResult(
                success=False,
                url=hub_url,
                method="hub_opinion_aggregate",
                error="Aucun lien article detecte sur le hub",
                word_count=0,
            )

        parts: List[str] = []
        total_words = 0
        titles: List[str] = []

        for au in article_urls:
            try:
                sub = await self.fetch_article(au, min_words=100, count_in_stats=False)
                if sub and sub.content:
                    label = sub.title or au
                    titles.append(label)
                    parts.append(f"=== {label} ===\n{sub.content}")
                    total_words += sub.word_count
            except Exception:
                continue

        if total_words < self.min_words:
            return ScrapeResult(
                success=False,
                url=hub_url,
                method="hub_opinion_aggregate",
                error=f"Agregat insuffisant ({total_words} mots)",
                word_count=total_words,
            )

        merged = "\n\n".join(parts)
        return ScrapeResult(
            success=True,
            url=hub_url,
            method="hub_opinion_aggregate",
            title=titles[0] if titles else None,
            content=merged[:25000],
            word_count=total_words,
            html_size=0,
        )

    def _scrapling_sync(self, url: str) -> ScrapeResult:
        try:
            from scrapling.fetchers import StealthyFetcher

            page = StealthyFetcher.fetch(
                url,
                headless=True,
                solve_cloudflare=True,
                network_idle=True,
            )
            html = page.html if hasattr(page, "html") else str(page)
            return self._result_from_html(html, url, "scrapling_stealth")
        except Exception as e:
            return ScrapeResult(
                success=False,
                url=url,
                method="scrapling_stealth",
                error=str(e),
                word_count=0,
            )

    async def _scrapling_stealth(self, url: str) -> Optional[ScrapeResult]:
        loop = asyncio.get_event_loop()
        r = await loop.run_in_executor(None, self._scrapling_sync, url)
        return r if r.word_count >= self.min_words else None

    def get_stats(self) -> Dict[str, Any]:
        t = self.stats["total"]
        return {
            "total": t,
            "success": self.stats["success"],
            "failed": self.stats["failed"],
            "success_rate": f"{self.stats['success'] / t * 100:.1f}%" if t else "0%",
            "by_method": dict(self.stats["by_method"]),
            "errors_count": len(self.stats["errors"]),
        }

    def reset_stats(self) -> None:
        self.stats = {"total": 0, "success": 0, "failed": 0, "by_method": {}, "errors": []}
