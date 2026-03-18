"""
Async RSS collector with per-domain rate limiting, trafilatura in thread pool,
and collection log persistence.
"""

import asyncio
import hashlib
import time
from datetime import datetime, timezone
from time import mktime
from typing import Optional

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

logger = structlog.get_logger(__name__)
settings = get_settings()


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
    if hasattr(entry, "author") and entry.author:
        return entry.author
    if hasattr(entry, "authors") and entry.authors:
        return entry.authors[0].get("name")
    return None


class RSSCollector:
    def __init__(self) -> None:
        self._factory = get_session_factory()
        self._semaphore = asyncio.Semaphore(5)
        self._domain_last_request: dict[str, float] = {}
        self._headers = {"User-Agent": settings.user_agent}

    async def collect_all(self) -> dict:
        async with self._factory() as db:
            result = await db.execute(
                select(MediaSource).where(
                    MediaSource.is_active.is_(True),
                    MediaSource.collection_method == "rss",
                    MediaSource.rss_url.isnot(None),
                )
            )
            sources = result.scalars().all()

        logger.info("collection.start", source_count=len(sources))
        tasks = [self._collect_source(s) for s in sources]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        stats: dict = {"total_sources": len(sources), "total_new": 0, "errors": []}
        for source, res in zip(sources, results):
            if isinstance(res, Exception):
                stats["errors"].append({"source": source.id, "error": str(res)})
                logger.error("collection.source_error", source=source.id, error=str(res))
            else:
                stats["total_new"] += res

        logger.info(
            "collection.complete",
            total_new=stats["total_new"],
            error_count=len(stats["errors"]),
        )
        return stats

    async def _rate_limit(self, domain: str) -> None:
        last = self._domain_last_request.get(domain, 0)
        elapsed = time.monotonic() - last
        if elapsed < settings.request_delay_seconds:
            await asyncio.sleep(settings.request_delay_seconds - elapsed)
        self._domain_last_request[domain] = time.monotonic()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _collect_source(self, source: MediaSource) -> int:
        async with self._semaphore:
            domain = source.rss_url.split("/")[2] if source.rss_url else ""
            await self._rate_limit(domain)

            log = CollectionLog(media_source_id=source.id, status="running")
            async with self._factory() as db:
                db.add(log)
                await db.commit()
                await db.refresh(log)
            log_id = log.id

            try:
                new_count = await self._do_collect(source)

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

                logger.info("collection.source_done", source=source.id, new=new_count)
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

    async def _do_collect(self, source: MediaSource) -> int:
        async with aiohttp.ClientSession(headers=self._headers) as http:
            async with http.get(
                source.rss_url,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                content = await resp.text()

        feed = feedparser.parse(content)
        if feed.bozo and not feed.entries:
            logger.warning("collection.bad_feed", source=source.id)
            return 0

        entries = feed.entries[: settings.max_articles_per_source]
        new_count = 0

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

                full_text = await self._extract_text(article_url)
                if full_text and len(full_text) < settings.min_article_length:
                    continue

                lang = self._detect_language(
                    full_text or entry.get("title", ""), source.languages
                )

                db.add(
                    Article(
                        media_source_id=source.id,
                        url=article_url,
                        url_hash=h,
                        title_original=entry.get("title", "Untitled"),
                        content_original=full_text,
                        author=_extract_author(entry),
                        published_at=_parse_date(entry),
                        source_language=lang,
                        status="collected",
                        word_count=len(full_text.split()) if full_text else None,
                    )
                )
                new_count += 1

            await db.commit()

        return new_count

    async def _extract_text(self, url: str) -> Optional[str]:
        try:
            downloaded = await asyncio.to_thread(trafilatura.fetch_url, url)
            if not downloaded:
                return None
            return await asyncio.to_thread(
                trafilatura.extract,
                downloaded,
                include_comments=False,
                include_tables=False,
                favor_recall=True,
                output_format="txt",
            )
        except Exception as exc:
            logger.warning("collection.extract_fail", url=url, error=str(exc))
            return None

    @staticmethod
    def _detect_language(text: str, source_languages: list[str]) -> str:
        try:
            lang, _ = py3langid.classify(text)
            return lang
        except Exception:
            return source_languages[0] if source_languages else "unknown"


async def run_collection() -> dict:
    collector = RSSCollector()
    return await collector.collect_all()
