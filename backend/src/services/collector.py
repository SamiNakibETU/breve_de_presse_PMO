"""
Async RSS collector with per-domain rate limiting, robust extraction pipeline,
and collection log persistence.

Extraction chain: trafilatura (recall) → trafilatura (precision) → RSS summary.
"""

import asyncio
import hashlib
import re
import time
from datetime import datetime, timezone
from time import mktime
from typing import Optional
from urllib.parse import urlparse

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

CUSTOM_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8,ar;q=0.7",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
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
    if hasattr(entry, "author") and entry.author:
        return entry.author
    if hasattr(entry, "authors") and entry.authors:
        return entry.authors[0].get("name")
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
        delay = settings.request_delay_seconds
        if elapsed < delay:
            await asyncio.sleep(delay - elapsed)
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
        headers = {
            "User-Agent": settings.user_agent,
            **CUSTOM_HEADERS,
        }

        async with aiohttp.ClientSession(headers=headers) as http:
            async with http.get(
                source.rss_url,
                timeout=aiohttp.ClientTimeout(total=45),
                allow_redirects=True,
                max_redirects=5,
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

                full_text = await self._extract_text_robust(article_url)

                if not full_text:
                    full_text = _extract_rss_summary(entry)

                if not full_text:
                    rss_title = entry.get("title", "")
                    rss_summary = entry.get("summary", "")
                    if rss_title and len(rss_title) > 20:
                        combined = f"{rss_title}. {rss_summary}" if rss_summary else rss_title
                        combined = re.sub(r"<[^>]+>", " ", combined)
                        combined = re.sub(r"\s+", " ", combined).strip()
                        if len(combined) >= 80:
                            full_text = combined

                if not full_text:
                    continue

                lang = self._detect_language(full_text, source.languages)

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
                        word_count=len(full_text.split()),
                    )
                )
                new_count += 1

            await db.commit()

        return new_count

    async def _extract_text_robust(self, url: str) -> Optional[str]:
        """Multi-strategy extraction: recall mode → precision mode → direct fetch."""
        text = await self._extract_trafilatura(url, favor_recall=True)
        if text:
            return text

        text = await self._extract_trafilatura(url, favor_recall=False)
        if text:
            return text

        text = await self._extract_direct_fetch(url)
        return text

    async def _extract_trafilatura(self, url: str, favor_recall: bool) -> Optional[str]:
        try:
            downloaded = await asyncio.to_thread(
                trafilatura.fetch_url,
                url,
                no_ssl=True,
            )
            if not downloaded:
                return None
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
                return None
            text = _clean_extracted_text(raw)
            if text and len(text) >= settings.min_article_length:
                return text
            return None
        except Exception as exc:
            logger.debug("collection.trafilatura_fail", url=url, mode="recall" if favor_recall else "precision", error=str(exc))
            return None

    async def _extract_direct_fetch(self, url: str) -> Optional[str]:
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
                        return None
                    html = await resp.text()

            if not html or len(html) < 500:
                return None

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
                return text
            return None
        except Exception as exc:
            logger.debug("collection.direct_fetch_fail", url=url, error=str(exc))
            return None

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


async def run_collection() -> dict:
    collector = RSSCollector()
    return await collector.collect_all()
