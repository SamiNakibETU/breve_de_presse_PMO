"""
Playwright headless scraper for SPA sources and sites with anti-bot protection.

Handles sources that fail with aiohttp/trafilatura due to:
  - Client-side rendering (SPA / React / Angular)
  - WAF / Cloudflare anti-bot
  - Heavy JS-dependent content loading

Falls back gracefully if Playwright is not installed.
"""

import asyncio
import hashlib
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin

import structlog
from sqlalchemy import select

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.models.collection_log import CollectionLog
from src.models.media_source import MediaSource

logger = structlog.get_logger(__name__)
settings = get_settings()

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.warning("playwright_not_installed", msg="pip install playwright && playwright install chromium")


PLAYWRIGHT_CONFIGS: dict[str, dict] = {
    "eg_ahram": {
        "opinion_url": "https://english.ahram.org.eg/UI/Front/Inner.aspx?NewsContentID=13",
        "base_url": "https://english.ahram.org.eg",
        "link_pattern": r"/News/\d+",
        "wait_selector": "div.news-list, article, .col-md-8",
        "languages": ["en", "ar"],
    },
    "qa_perinsula": {
        "opinion_url": "https://thepeninsulaqatar.com/opinion",
        "base_url": "https://thepeninsulaqatar.com",
        "link_pattern": r"/article/\d+",
        "wait_selector": "article, .article-card, .opinion-list",
        "languages": ["en"],
    },
    "ae_khaleej": {
        "opinion_url": "https://www.khaleejtimes.com/editorials-columns",
        "base_url": "https://www.khaleejtimes.com",
        "link_pattern": r"/editorials-columns/",
        "wait_selector": "article, .article-item, .listing-page",
        "languages": ["en"],
    },
    "jo_jordantimes": {
        "opinion_url": "https://www.jordantimes.com/opinion",
        "base_url": "https://www.jordantimes.com",
        "link_pattern": r"/opinion/",
        "wait_selector": "article, .view-content, .node-article",
        "languages": ["en"],
    },
    "sa_arabnews": {
        "opinion_url": "https://www.arabnews.com/opinion",
        "base_url": "https://www.arabnews.com",
        "link_pattern": r"/node/\d+",
        "wait_selector": "article, .view-content, .region-content",
        "languages": ["en"],
    },
}

AUTHOR_BLACKLIST = {
    "author", "admin", "administrator", "editor", "staff", "desk",
    "news desk", "editorial", "web editor", "correspondent",
    "staff reporter", "online editor", "agency",
}


def _url_hash(url: str) -> str:
    return hashlib.sha256(url.strip().encode()).hexdigest()


def _extract_meta(html: str, pattern: str) -> Optional[str]:
    match = re.search(pattern, html, re.IGNORECASE)
    return match.group(1).strip() if match else None


def _extract_author(html: str) -> Optional[str]:
    patterns = [
        r'<meta\s+name="author"\s+content="([^"]+)"',
        r'<meta\s+property="article:author"\s+content="([^"]+)"',
        r'"author"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"',
        r'"author"\s*:\s*"([^"]+)"',
        r'<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)</span>',
        r'<a[^>]+rel="author"[^>]*>([^<]+)</a>',
    ]
    for p in patterns:
        match = re.search(p, html, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            if name.lower() not in AUTHOR_BLACKLIST and 2 < len(name) < 100:
                return name
    return None


def _extract_date(html: str) -> Optional[datetime]:
    patterns = [
        r'<meta\s+property="article:published_time"\s+content="([^"]+)"',
        r'"datePublished"\s*:\s*"([^"]+)"',
        r'<time[^>]+datetime="([^"]+)"',
    ]
    for p in patterns:
        match = re.search(p, html, re.IGNORECASE)
        if match:
            ds = match.group(1).strip()
            for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
                try:
                    dt = datetime.strptime(ds, fmt)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    return dt
                except ValueError:
                    continue
    return None


def _extract_title(html: str) -> str:
    for p in [
        r'<meta\s+property="og:title"\s+content="([^"]+)"',
        r'<title>([^<]+)</title>',
        r'<h1[^>]*>([^<]+)</h1>',
    ]:
        match = re.search(p, html, re.IGNORECASE)
        if match:
            t = match.group(1).strip()
            if len(t) > 5:
                return t
    return "Untitled"


def _extract_body(html: str) -> Optional[str]:
    """Extract main article text from rendered HTML."""
    try:
        import trafilatura
        text = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=False,
            favor_recall=True,
            output_format="txt",
            deduplicate=True,
        )
        if text and len(text) >= 100:
            boilerplate = [
                r"©\s*\d{4}.*$", r"All rights reserved.*$",
                r"Subscribe to .*$", r"Share this article.*$",
                r"Tags\s*:.*$", r"Related articles.*$",
            ]
            for bp in boilerplate:
                text = re.sub(bp, "", text, flags=re.IGNORECASE | re.MULTILINE)
            return re.sub(r"\n{3,}", "\n\n", text).strip()
    except Exception:
        pass
    return None


def _detect_language(text: str, source_languages: list[str]) -> str:
    try:
        import py3langid
        detected, _ = py3langid.classify(text)
        if detected in source_languages:
            return detected
    except Exception:
        pass
    return source_languages[0] if source_languages else "en"


class PlaywrightScraper:
    def __init__(self) -> None:
        self._factory = get_session_factory()
        self._semaphore = asyncio.Semaphore(2)

    async def scrape_all(self) -> dict:
        if not PLAYWRIGHT_AVAILABLE:
            return {"error": "playwright not installed", "total_new": 0}

        async with self._factory() as db:
            result = await db.execute(
                select(MediaSource).where(
                    MediaSource.is_active.is_(True),
                    MediaSource.collection_method == "playwright",
                )
            )
            sources = result.scalars().all()

        scrapable = [s for s in sources if s.id in PLAYWRIGHT_CONFIGS]
        if not scrapable:
            return {"total_sources": 0, "total_new": 0, "errors": []}

        logger.info("playwright_scraper.start", total=len(scrapable))

        stats: dict = {"total_sources": len(scrapable), "total_new": 0, "errors": []}

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 720},
                locale="en-US",
            )

            for source in scrapable:
                try:
                    new = await self._scrape_source(context, source)
                    stats["total_new"] += new
                except Exception as exc:
                    stats["errors"].append({"source": source.id, "error": str(exc)[:200]})
                    logger.error("playwright_scraper.source_error", source=source.id, error=str(exc)[:200])

            await context.close()
            await browser.close()

        logger.info("playwright_scraper.complete", total_new=stats["total_new"], errors=len(stats["errors"]))
        return stats

    async def _scrape_source(self, context, source: MediaSource) -> int:
        async with self._semaphore:
            config = PLAYWRIGHT_CONFIGS[source.id]
            opinion_url = config["opinion_url"]
            base_url = config["base_url"]

            log = CollectionLog(media_source_id=source.id, status="running")
            async with self._factory() as db:
                db.add(log)
                await db.commit()
                await db.refresh(log)
            log_id = log.id

            try:
                page = await context.new_page()
                await page.goto(opinion_url, wait_until="networkidle", timeout=30000)

                wait_sel = config.get("wait_selector")
                if wait_sel:
                    try:
                        await page.wait_for_selector(wait_sel, timeout=10000)
                    except Exception:
                        pass

                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(2)

                index_html = await page.content()
                await page.close()

                links = self._extract_links(index_html, base_url, config.get("link_pattern"))
                links = links[:settings.max_articles_per_source]

                if not links:
                    logger.warning("playwright_scraper.no_links", source=source.id, url=opinion_url)
                    return 0

                logger.info("playwright_scraper.links_found", source=source.id, count=len(links))

                new_count = 0
                async with self._factory() as db:
                    for link in links:
                        h = _url_hash(link)
                        exists = await db.execute(
                            select(Article.id).where(Article.url_hash == h)
                        )
                        if exists.scalar_one_or_none():
                            continue

                        text, author, title, pub_date = await self._extract_article(context, link)
                        if not text or len(text) < 100:
                            continue

                        langs = config.get("languages", ["en"])
                        lang = _detect_language(text, langs)

                        db.add(
                            Article(
                                media_source_id=source.id,
                                url=link,
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
                        await asyncio.sleep(2)

                    await db.commit()

                async with self._factory() as db:
                    cl = await db.get(CollectionLog, log_id)
                    if cl:
                        cl.articles_new = new_count
                        cl.status = "completed"
                        cl.completed_at = datetime.now(timezone.utc)
                    src = await db.get(MediaSource, source.id)
                    if src:
                        src.last_collected_at = datetime.now(timezone.utc)
                    await db.commit()

                logger.info("playwright_scraper.source_done", source=source.id, new=new_count)
                return new_count

            except Exception as exc:
                async with self._factory() as db:
                    cl = await db.get(CollectionLog, log_id)
                    if cl:
                        cl.status = "error"
                        cl.error_message = str(exc)[:500]
                        cl.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                raise

    def _extract_links(self, html: str, base_url: str, link_pattern: Optional[str]) -> list[str]:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        seen: set[str] = set()
        urls: list[str] = []

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if not href or href.startswith("#") or href.startswith("javascript:"):
                continue

            full_url = urljoin(base_url, href)

            if link_pattern and not re.search(link_pattern, full_url):
                continue

            skip = ["/tag/", "/category/", "/author/", "/page/", "/search",
                    "/login", "/register", ".pdf", ".jpg", ".png"]
            if any(p in full_url.lower() for p in skip):
                continue

            if full_url not in seen:
                seen.add(full_url)
                urls.append(full_url)

        return urls

    async def _extract_article(
        self, context, url: str
    ) -> tuple[Optional[str], Optional[str], Optional[str], Optional[datetime]]:
        try:
            page = await context.new_page()
            await page.goto(url, wait_until="networkidle", timeout=25000)

            try:
                await page.wait_for_selector("article, .article-body, .story-body, p", timeout=8000)
            except Exception:
                pass

            html = await page.content()
            await page.close()

            if not html or len(html) < 500:
                return None, None, None, None

            author = _extract_author(html)
            pub_date = _extract_date(html)
            title = _extract_title(html)
            text = _extract_body(html)

            return text, author, title, pub_date

        except Exception as exc:
            logger.debug("playwright_scraper.article_fail", url=url, error=str(exc)[:100])
            return None, None, None, None


async def run_playwright_scraping() -> dict:
    scraper = PlaywrightScraper()
    return await scraper.scrape_all()
