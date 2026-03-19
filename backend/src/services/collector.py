"""
Async RSS collector with per-domain rate limiting, robust extraction pipeline,
collection log persistence, and editorial relevance filtering.

Extraction chain: trafilatura (recall) → trafilatura (precision) → RSS summary.
Feed priority: rss_opinion_url (if available) → rss_url (fallback).
"""

import asyncio
import hashlib
import re
import time
from datetime import datetime, timezone
from time import mktime
from typing import Callable, Optional

import aiohttp
import feedparser
import py3langid
import structlog
import trafilatura
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.models.collection_log import CollectionLog
from src.models.media_source import MediaSource
from src.services.editorial_scope import (
    should_ingest_rss_entry,
    should_ingest_scraped_article,
)

logger = structlog.get_logger(__name__)
settings = get_settings()

CUSTOM_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8,ar;q=0.7",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
}

GENERIC_AUTHOR_BLACKLIST = {
    "author", "admin", "administrator", "editor", "staff", "desk",
    "news desk", "editorial", "web editor", "correspondent",
    "staff reporter", "online editor", "agency",
}


def _url_hash(url: str) -> str:
    return hashlib.sha256(url.strip().encode()).hexdigest()


def _parse_date(entry) -> Optional[datetime]:
    for attr in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, attr, None)
        if parsed:
            try:
                return datetime.fromtimestamp(mktime(parsed), tz=timezone.utc)
            except (ValueError, OverflowError):
                continue
    return None


def _extract_author(entry) -> Optional[str]:
    author = None
    if hasattr(entry, "author") and entry.author:
        author = entry.author.strip()
    elif hasattr(entry, "authors") and entry.authors:
        author = (entry.authors[0].get("name") or "").strip()

    if author and author.lower() in GENERIC_AUTHOR_BLACKLIST:
        return None
    if author and len(author) < 2:
        return None
    return author or None


def _extract_author_from_html(html: str) -> Optional[str]:
    """Try to extract author from common HTML meta tags and schema markup."""
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


def _extract_rss_summary(entry) -> Optional[str]:
    raw = entry.get("summary") or entry.get("description") or ""
    if not raw:
        for content_item in entry.get("content", []):
            if content_item.get("value"):
                raw = content_item["value"]
                break
    if not raw:
        return None

    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"\s+", " ", text).strip()

    if len(text) < 80:
        return None
    return text


def _clean_extracted_text(text: str) -> Optional[str]:
    """Remove boilerplate patterns that trafilatura sometimes leaves."""
    if not text:
        return None

    boilerplate = [
        r"©\s*\d{4}.*$",
        r"All rights reserved.*$",
        r"Tous droits réservés.*$",
        r"Subscribe to .*$",
        r"Abonnez-vous .*$",
        r"Share this article.*$",
        r"Tags\s*:.*$",
        r"Related articles.*$",
    ]
    for pattern in boilerplate:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE | re.MULTILINE)

    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    if len(text) < 80:
        return None
    return text


class RSSCollector:
    def __init__(self) -> None:
        self._factory = get_session_factory()
        self._semaphore = asyncio.Semaphore(5)
        self._domain_last_request: dict[str, float] = {}

    async def collect_all(self) -> dict:
        async with self._factory() as db:
            from sqlalchemy import or_
            result = await db.execute(
                select(MediaSource).where(
                    MediaSource.is_active.is_(True),
                    MediaSource.collection_method == "rss",
                    or_(
                        MediaSource.rss_url.isnot(None),
                        MediaSource.rss_opinion_url.isnot(None),
                    ),
                )
            )
            sources = result.scalars().all()

        logger.info("collection.start", source_count=len(sources))
        tasks = [self._collect_source(s) for s in sources]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        stats: dict = {"total_sources": len(sources), "total_new": 0, "total_filtered": 0, "errors": []}
        for source, res in zip(sources, results):
            if isinstance(res, Exception):
                stats["errors"].append({"source": source.id, "error": str(res)})
                logger.error("collection.source_error", source=source.id, error=str(res))
            elif isinstance(res, dict):
                stats["total_new"] += res.get("new", 0)
                stats["total_filtered"] += res.get("filtered", 0)
            else:
                stats["total_new"] += res

        logger.info(
            "collection.complete",
            total_new=stats["total_new"],
            total_filtered=stats["total_filtered"],
            error_count=len(stats["errors"]),
        )
        return stats

    async def _rate_limit(self, domain: str) -> None:
        last = self._domain_last_request.get(domain, 0)
        elapsed = time.monotonic() - last
        delay = settings.request_delay_seconds
        if elapsed < delay:
            await asyncio.sleep(delay - elapsed)
        self._domain_last_request[domain] = time.monotonic()

    def _get_feed_url(self, source: MediaSource) -> str:
        """Prefer opinion-specific RSS feed when available."""
        opinion_url = getattr(source, "rss_opinion_url", None)
        if opinion_url:
            return opinion_url
        return source.rss_url

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _collect_source(self, source: MediaSource) -> dict:
        async with self._semaphore:
            feed_url = self._get_feed_url(source)
            if not feed_url:
                return {"new": 0, "filtered": 0}
            domain = feed_url.split("/")[2] if feed_url else ""
            await self._rate_limit(domain)

            log = CollectionLog(media_source_id=source.id, status="running")
            async with self._factory() as db:
                db.add(log)
                await db.commit()
                await db.refresh(log)
            log_id = log.id

            try:
                result = await self._do_collect(source, feed_url)

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
                    "collection.source_done",
                    source=source.id,
                    new=result["new"],
                    filtered=result["filtered"],
                    feed_type="opinion" if getattr(source, "rss_opinion_url", None) else "general",
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
                raise

    async def _do_collect(self, source: MediaSource, feed_url: str) -> dict:
        headers = {
            "User-Agent": settings.user_agent,
            **CUSTOM_HEADERS,
        }

        async with aiohttp.ClientSession(headers=headers) as http:
            async with http.get(
                feed_url,
                timeout=aiohttp.ClientTimeout(total=45),
                allow_redirects=True,
                max_redirects=5,
            ) as resp:
                content = await resp.text()

        feed = feedparser.parse(content)
        if feed.bozo and not feed.entries:
            logger.warning("collection.bad_feed", source=source.id, feed_url=feed_url)
            return {"new": 0, "filtered": 0}

        entries = feed.entries[: settings.max_articles_per_source]
        new_count = 0
        filtered_count = 0
        uses_opinion_feed = bool(getattr(source, "rss_opinion_url", None))

        async with self._factory() as db:
            for entry in entries:
                article_url = getattr(entry, "link", None)
                if not article_url:
                    continue

                h = _url_hash(article_url)
                exists = await db.execute(
                    select(Article.id).where(Article.url_hash == h)
                )
                if exists.scalar_one_or_none():
                    continue

                title = entry.get("title", "")
                rss_summary_text = _extract_rss_summary(entry) or ""

                if not should_ingest_rss_entry(
                    title, rss_summary_text, uses_opinion_feed=uses_opinion_feed
                ):
                    filtered_count += 1
                    logger.debug(
                        "collection.filtered_irrelevant",
                        source=source.id,
                        title=title[:80],
                    )
                    continue

                full_text, html_author = await self._extract_text_and_author(article_url)

                if not full_text:
                    full_text = rss_summary_text if len(rss_summary_text) >= 80 else None

                if not full_text:
                    if title and len(title) > 20:
                        combined = f"{title}. {rss_summary_text}" if rss_summary_text else title
                        combined = re.sub(r"<[^>]+>", " ", combined)
                        combined = re.sub(r"\s+", " ", combined).strip()
                        if len(combined) >= 80:
                            full_text = combined

                if not full_text:
                    continue

                if not should_ingest_scraped_article(title or "", full_text):
                    filtered_count += 1
                    logger.debug(
                        "collection.filtered_lifestyle_body",
                        source=source.id,
                        title=(title or "")[:80],
                    )
                    continue

                author = _extract_author(entry) or html_author
                lang = self._detect_language(full_text, source.languages)

                db.add(
                    Article(
                        media_source_id=source.id,
                        url=article_url,
                        url_hash=h,
                        title_original=title or "Untitled",
                        content_original=full_text,
                        author=author,
                        published_at=_parse_date(entry),
                        source_language=lang,
                        status="collected",
                        word_count=len(full_text.split()),
                    )
                )
                new_count += 1

            await db.commit()

        return {"new": new_count, "filtered": filtered_count}

    async def _extract_text_and_author(self, url: str) -> tuple[Optional[str], Optional[str]]:
        """Extract text and author. Returns (text, author)."""
        text, author = await self._extract_trafilatura_with_meta(url, favor_recall=True)
        if text:
            return text, author

        text, author = await self._extract_trafilatura_with_meta(url, favor_recall=False)
        if text:
            return text, author

        text, author = await self._extract_direct_fetch(url)
        return text, author

    async def _extract_trafilatura_with_meta(self, url: str, favor_recall: bool) -> tuple[Optional[str], Optional[str]]:
        try:
            downloaded = await asyncio.to_thread(
                trafilatura.fetch_url,
                url,
                no_ssl=True,
            )
            if not downloaded:
                return None, None

            author = _extract_author_from_html(downloaded)

            raw = await asyncio.to_thread(
                trafilatura.extract,
                downloaded,
                include_comments=False,
                include_tables=False,
                favor_recall=favor_recall,
                favor_precision=not favor_recall,
                output_format="txt",
                deduplicate=True,
            )
            if not raw:
                return None, author
            text = _clean_extracted_text(raw)
            if text and len(text) >= settings.min_article_length:
                return text, author
            return None, author
        except Exception as exc:
            logger.debug("collection.trafilatura_fail", url=url, mode="recall" if favor_recall else "precision", error=str(exc))
            return None, None

    async def _extract_direct_fetch(self, url: str) -> tuple[Optional[str], Optional[str]]:
        """Fallback: fetch HTML directly with aiohttp and extract with trafilatura."""
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                **CUSTOM_HEADERS,
            }
            async with aiohttp.ClientSession(headers=headers) as http:
                async with http.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=30),
                    allow_redirects=True,
                    max_redirects=5,
                ) as resp:
                    if resp.status != 200:
                        return None, None
                    html = await resp.text()

            if not html or len(html) < 500:
                return None, None

            author = _extract_author_from_html(html)

            raw = await asyncio.to_thread(
                trafilatura.extract,
                html,
                include_comments=False,
                include_tables=False,
                favor_recall=True,
                output_format="txt",
            )
            text = _clean_extracted_text(raw) if raw else None
            if text and len(text) >= settings.min_article_length:
                return text, author
            return None, author
        except Exception as exc:
            logger.debug("collection.direct_fetch_fail", url=url, error=str(exc))
            return None, None

    @staticmethod
    def _detect_language(text: str, source_languages: list[str]) -> str:
        try:
            detected, _ = py3langid.classify(text)
        except Exception:
            return source_languages[0] if source_languages else "unknown"

        if not source_languages:
            return detected

        if detected in source_languages:
            return detected

        CONFUSED_PAIRS = {
            frozenset({"ar", "fa"}),
            frozenset({"ar", "ur"}),
        }
        for pair in CONFUSED_PAIRS:
            if detected in pair:
                overlap = pair & set(source_languages)
                if overlap and detected not in set(source_languages):
                    return next(iter(overlap))

        if detected not in source_languages and len(source_languages) == 1:
            return source_languages[0]

        return detected


async def run_collection(
    on_progress: Optional[Callable[[str, str], None]] = None,
) -> dict:
    """
    on_progress(step_key, step_label) : appelé aux étapes grossières (UI / polling).
    """
    if on_progress:
        on_progress("rss", "Lecture des flux RSS…")
    collector = RSSCollector()
    rss_stats = await collector.collect_all()

    if on_progress:
        on_progress("web_scraper", "Scraping HTTP (BeautifulSoup)…")
    try:
        from src.services.web_scraper import run_web_scraping
        scrape_stats = await run_web_scraping()
        rss_stats["web_scraper"] = scrape_stats
        rss_stats["total_new"] = rss_stats.get("total_new", 0) + scrape_stats.get("total_new", 0)
        rss_stats["total_sources"] = rss_stats.get("total_sources", 0) + scrape_stats.get("total_sources", 0)
        if scrape_stats.get("errors"):
            rss_stats["errors"].extend(scrape_stats["errors"])
    except Exception as exc:
        logger.warning("web_scraper.skipped", error=str(exc)[:200])
        rss_stats["web_scraper"] = {"error": str(exc)[:200]}

    if on_progress:
        on_progress("playwright", "Scraping Playwright (pages dynamiques)…")
    try:
        from src.services.playwright_scraper import run_playwright_scraping
        pw_stats = await run_playwright_scraping()
        rss_stats["playwright_scraper"] = pw_stats
        rss_stats["total_new"] = rss_stats.get("total_new", 0) + pw_stats.get("total_new", 0)
        rss_stats["total_sources"] = rss_stats.get("total_sources", 0) + pw_stats.get("total_sources", 0)
        if pw_stats.get("errors"):
            rss_stats["errors"].extend(pw_stats["errors"])
    except Exception as exc:
        logger.warning("playwright_scraper.skipped", error=str(exc)[:200])
        rss_stats["playwright_scraper"] = {"error": str(exc)[:200]}

    if on_progress:
        on_progress("done", "Finalisation…")

    return rss_stats
