"""
Direct web scraper for editorial/opinion sections of sources without RSS feeds.

Fetches opinion/editorial index pages, extracts article links, then extracts
full content from each article page using trafilatura + fallback HTML parsing.

Only handles server-side rendered (SSR) pages. SPA sources require Playwright (Phase v3).
"""

import asyncio
import hashlib
import re
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin, urlparse

import aiohttp
import structlog
import trafilatura
from bs4 import BeautifulSoup
from sqlalchemy import select

from src.config import get_settings
from src.services.editorial_scope import should_ingest_scraped_article
from src.database import get_session_factory
from src.models.article import Article
from src.models.collection_log import CollectionLog
from src.models.media_source import MediaSource

logger = structlog.get_logger(__name__)
settings = get_settings()

SCRAPER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8,fr;q=0.7",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
}

SOURCE_CONFIGS = {
    "ir_iranintl": {
        "opinion_url": "https://www.iranintl.com/en/opinion",
        "link_selector": "a[href*='/en/']",
        "link_pattern": r"/en/\d{12}",
        "base_url": "https://www.iranintl.com",
    },
    "ae_national": {
        "opinion_url": "https://www.thenationalnews.com/opinion/comment/",
        "link_selector": "a[href*='/opinion/']",
        "link_pattern": r"/opinion/(comment|editorial)/\d{4}/",
        "base_url": "https://www.thenationalnews.com",
        "extra_pages": [
            "https://www.thenationalnews.com/opinion/editorial/",
        ],
    },
    "iq_rudaw": {
        "opinion_url": "https://www.rudaw.net/english/opinion",
        "link_selector": "a[href*='/english/']",
        "link_pattern": r"/english/\w+/\d{8}",
        "base_url": "https://www.rudaw.net",
    },
    "sa_saudigazette": {
        "opinion_url": "https://saudigazette.com.sa",
        "link_selector": "a[href*='/article/']",
        "link_pattern": r"/article/\d+/opinion/",
        "base_url": "https://saudigazette.com.sa",
    },
}

GENERIC_AUTHOR_BLACKLIST = {
    "author", "admin", "administrator", "editor", "staff", "desk",
    "news desk", "editorial", "web editor", "correspondent",
    "staff reporter", "online editor", "agency",
}


def _url_hash(url: str) -> str:
    return hashlib.sha256(url.strip().encode()).hexdigest()


def _extract_author_from_html(html: str) -> Optional[str]:
    patterns = [
        r'<meta\s+name="author"\s+content="([^"]+)"',
        r'<meta\s+property="article:author"\s+content="([^"]+)"',
        r'"author"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"',
        r'"author"\s*:\s*"([^"]+)"',
        r'<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)</span>',
        r'<a[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)</a>',
        r'<a[^>]+rel="author"[^>]*>([^<]+)</a>',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            if name.lower() not in GENERIC_AUTHOR_BLACKLIST and 2 < len(name) < 100:
                return name
    return None


def _extract_date_from_html(html: str) -> Optional[datetime]:
    patterns = [
        r'<meta\s+property="article:published_time"\s+content="([^"]+)"',
        r'<meta\s+name="publish[_-]?date"\s+content="([^"]+)"',
        r'"datePublished"\s*:\s*"([^"]+)"',
        r'<time[^>]+datetime="([^"]+)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            date_str = match.group(1).strip()
            for fmt in (
                "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%dT%H:%M:%S.%f%z",
                "%Y-%m-%d",
            ):
                try:
                    dt = datetime.strptime(date_str, fmt)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    return dt
                except ValueError:
                    continue
    return None


def _extract_title_from_html(html: str) -> str:
    patterns = [
        r'<meta\s+property="og:title"\s+content="([^"]+)"',
        r'<title>([^<]+)</title>',
        r'<h1[^>]*>([^<]+)</h1>',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            title = match.group(1).strip()
            title = re.sub(r'\s*[-|]\s*(The National|Gulf News|Al Jazeera|Rudaw).*$', '', title)
            if len(title) > 5:
                return title
    return "Untitled"


def _detect_language(text: str, source_languages: list[str]) -> str:
    try:
        import py3langid
        detected, _ = py3langid.classify(text)
    except Exception:
        return source_languages[0] if source_languages else "unknown"

    if detected in source_languages:
        return detected
    if len(source_languages) == 1:
        return source_languages[0]
    return detected


class WebScraper:
    def __init__(self) -> None:
        self._factory = get_session_factory()
        self._semaphore = asyncio.Semaphore(3)
        self._domain_last_request: dict[str, float] = {}

    async def scrape_all(self) -> dict:
        async with self._factory() as db:
            result = await db.execute(
                select(MediaSource).where(
                    MediaSource.is_active.is_(True),
                    MediaSource.collection_method == "scraping",
                )
            )
            sources = result.scalars().all()

        scrapable = [s for s in sources if s.id in SOURCE_CONFIGS]
        logger.info("web_scraper.start", total_sources=len(sources), scrapable=len(scrapable))

        tasks = [self._scrape_source(s) for s in scrapable]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        stats: dict = {
            "total_sources": len(scrapable),
            "total_new": 0,
            "total_filtered": 0,
            "errors": [],
            "skipped_no_config": len(sources) - len(scrapable),
        }
        for source, res in zip(scrapable, results):
            if isinstance(res, Exception):
                stats["errors"].append({"source": source.id, "error": str(res)[:200]})
                logger.error("web_scraper.source_error", source=source.id, error=str(res)[:200])
            elif isinstance(res, dict):
                stats["total_new"] += int(res.get("new", 0))
                stats["total_filtered"] += int(res.get("filtered", 0))
            elif isinstance(res, int):
                stats["total_new"] += res

        logger.info(
            "web_scraper.complete",
            total_new=stats["total_new"],
            error_count=len(stats["errors"]),
        )
        return stats

    async def _rate_limit(self, domain: str) -> None:
        last = self._domain_last_request.get(domain, 0)
        elapsed = time.monotonic() - last
        delay = max(settings.request_delay_seconds, 3.0)
        if elapsed < delay:
            await asyncio.sleep(delay - elapsed)
        self._domain_last_request[domain] = time.monotonic()

    async def _scrape_source(self, source: MediaSource) -> dict:
        async with self._semaphore:
            config = SOURCE_CONFIGS.get(source.id)
            if not config:
                return {"new": 0, "filtered": 0}

            domain = urlparse(config["opinion_url"]).netloc
            await self._rate_limit(domain)

            log = CollectionLog(media_source_id=source.id, status="running")
            async with self._factory() as db:
                db.add(log)
                await db.commit()
                await db.refresh(log)
            log_id = log.id

            try:
                result = await self._do_scrape(source, config)

                async with self._factory() as db:
                    cl = await db.get(CollectionLog, log_id)
                    if cl:
                        cl.articles_new = result["new"]
                        cl.status = "completed"
                        cl.completed_at = datetime.now(timezone.utc)
                    src = await db.get(MediaSource, source.id)
                    if src:
                        src.last_collected_at = datetime.now(timezone.utc)
                    await db.commit()

                logger.info(
                    "web_scraper.source_done",
                    source=source.id,
                    new=result["new"],
                    filtered=result["filtered"],
                )
                return result

            except Exception as exc:
                async with self._factory() as db:
                    cl = await db.get(CollectionLog, log_id)
                    if cl:
                        cl.status = "error"
                        cl.error_message = str(exc)[:500]
                        cl.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                logger.error("web_scraper.source_failed", source=source.id, error=str(exc)[:200])
                return {"new": 0, "filtered": 0}

    async def _do_scrape(self, source: MediaSource, config: dict) -> dict:
        opinion_url = config["opinion_url"]
        base_url = config["base_url"]

        pages_to_fetch = [opinion_url] + config.get("extra_pages", [])
        article_urls: list[str] = []
        seen_urls: set[str] = set()

        for page_url in pages_to_fetch:
            try:
                async with aiohttp.ClientSession(headers=SCRAPER_HEADERS) as http:
                    async with http.get(
                        page_url,
                        timeout=aiohttp.ClientTimeout(total=30),
                        allow_redirects=True,
                        max_redirects=5,
                    ) as resp:
                        if resp.status != 200:
                            logger.warning(
                                "web_scraper.bad_status",
                                source=source.id, url=page_url, status=resp.status,
                            )
                            continue
                        index_html = await resp.text()
            except Exception as exc:
                logger.debug("web_scraper.page_fetch_fail", url=page_url, error=str(exc)[:100])
                continue

            links = self._extract_article_links(
                index_html, base_url, config.get("link_selector"), config.get("link_pattern")
            )
            for link in links:
                if link not in seen_urls:
                    seen_urls.add(link)
                    article_urls.append(link)

        if not article_urls:
            logger.warning("web_scraper.no_links_found", source=source.id, url=opinion_url)
            return {"new": 0, "filtered": 0}

        article_urls = article_urls[:settings.max_articles_per_source]
        logger.info("web_scraper.links_found", source=source.id, count=len(article_urls))

        new_count = 0
        filtered_count = 0
        async with self._factory() as db:
            for article_url in article_urls:
                h = _url_hash(article_url)
                exists = await db.execute(
                    select(Article.id).where(Article.url_hash == h)
                )
                if exists.scalar_one_or_none():
                    continue

                domain = urlparse(article_url).netloc
                await self._rate_limit(domain)

                text, author, title, pub_date = await self._extract_article(article_url)
                if not text or len(text) < 80:
                    continue

                if not should_ingest_scraped_article(title or "", text):
                    filtered_count += 1
                    continue

                lang = _detect_language(text, source.languages)

                db.add(
                    Article(
                        media_source_id=source.id,
                        url=article_url,
                        url_hash=h,
                        title_original=title or "Untitled",
                        content_original=text,
                        author=author,
                        published_at=pub_date,
                        source_language=lang,
                        status="collected",
                        word_count=len(text.split()),
                    )
                )
                new_count += 1

            await db.commit()

        return {"new": new_count, "filtered": filtered_count}

    def _extract_article_links(
        self,
        html: str,
        base_url: str,
        link_selector: Optional[str],
        link_pattern: Optional[str],
    ) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        seen = set()
        urls = []

        if link_selector:
            elements = soup.select(link_selector)
        else:
            elements = soup.find_all("a", href=True)

        for el in elements:
            href = el.get("href", "")
            if not href or href.startswith("#") or href.startswith("javascript:"):
                continue

            full_url = urljoin(base_url, href)

            if link_pattern and not re.search(link_pattern, full_url):
                continue

            skip_patterns = [
                "/tag/", "/category/", "/author/", "/page/", "/search",
                "/login", "/register", "/subscribe", "/about", "/contact",
                "/rss", "/feed", ".pdf", ".jpg", ".png",
            ]
            if any(p in full_url.lower() for p in skip_patterns):
                continue

            if full_url not in seen:
                seen.add(full_url)
                urls.append(full_url)

        return urls

    async def _extract_article(
        self, url: str
    ) -> tuple[Optional[str], Optional[str], Optional[str], Optional[datetime]]:
        try:
            async with aiohttp.ClientSession(headers=SCRAPER_HEADERS) as http:
                async with http.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=30),
                    allow_redirects=True,
                    max_redirects=5,
                ) as resp:
                    if resp.status != 200:
                        return None, None, None, None
                    html = await resp.text()

            if not html or len(html) < 500:
                return None, None, None, None

            author = _extract_author_from_html(html)
            pub_date = _extract_date_from_html(html)
            title = _extract_title_from_html(html)

            text = await asyncio.to_thread(
                trafilatura.extract,
                html,
                include_comments=False,
                include_tables=False,
                favor_recall=True,
                output_format="txt",
                deduplicate=True,
            )

            if not text or len(text) < 80:
                text = await asyncio.to_thread(
                    trafilatura.extract,
                    html,
                    include_comments=False,
                    include_tables=False,
                    favor_precision=True,
                    output_format="txt",
                )

            if text:
                boilerplate = [
                    r"©\s*\d{4}.*$",
                    r"All rights reserved.*$",
                    r"Subscribe to .*$",
                    r"Share this article.*$",
                    r"Tags\s*:.*$",
                    r"Related articles.*$",
                ]
                for pattern in boilerplate:
                    text = re.sub(pattern, "", text, flags=re.IGNORECASE | re.MULTILINE)
                text = re.sub(r"\n{3,}", "\n\n", text).strip()

            if not text or len(text) < 80:
                return None, author, title, pub_date

            return text, author, title, pub_date

        except Exception as exc:
            logger.debug("web_scraper.article_fail", url=url, error=str(exc)[:100])
            return None, None, None, None


async def run_web_scraping() -> dict:
    scraper = WebScraper()
    return await scraper.scrape_all()
