"""
OLJ Press Review — RSS Collector
Async collection from 40+ RSS feeds with deduplication.
"""

import asyncio
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

import aiohttp
import feedparser
import trafilatura
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import get_settings
from src.models.database import Article, MediaSource, get_session_factory

logger = logging.getLogger(__name__)
settings = get_settings()


def url_hash(url: str) -> str:
    """Generate SHA-256 hash of URL for deduplication."""
    return hashlib.sha256(url.strip().encode()).hexdigest()


def parse_date(entry) -> Optional[datetime]:
    """Parse RSS entry date to datetime."""
    for attr in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, attr, None)
        if parsed:
            try:
                from time import mktime
                return datetime.fromtimestamp(mktime(parsed), tz=timezone.utc)
            except (ValueError, OverflowError):
                continue
    return None


class RSSCollector:
    """Collects articles from RSS feeds asynchronously."""

    def __init__(self):
        self.session_factory = get_session_factory()
        self.semaphore = asyncio.Semaphore(5)  # Max 5 concurrent feeds
        self.headers = {"User-Agent": settings.user_agent}

    async def collect_all(self) -> dict:
        """Collect from all active RSS-based media sources."""
        async with self.session_factory() as db:
            result = await db.execute(
                select(MediaSource).where(
                    MediaSource.is_active == True,
                    MediaSource.collection_method == "rss",
                    MediaSource.rss_url.isnot(None),
                )
            )
            sources = result.scalars().all()

        logger.info(f"Starting collection from {len(sources)} RSS sources")
        
        tasks = [self._collect_source(source) for source in sources]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        stats = {"total_sources": len(sources), "total_new": 0, "errors": []}
        for source, result in zip(sources, results):
            if isinstance(result, Exception):
                stats["errors"].append({"source": source.id, "error": str(result)})
                logger.error(f"Error collecting {source.id}: {result}")
            else:
                stats["total_new"] += result
        
        logger.info(
            f"Collection complete: {stats['total_new']} new articles, "
            f"{len(stats['errors'])} errors"
        )
        return stats

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _collect_source(self, source: MediaSource) -> int:
        """Collect articles from a single RSS source."""
        async with self.semaphore:
            logger.info(f"Collecting from {source.name} ({source.rss_url})")
            
            # Fetch RSS feed
            async with aiohttp.ClientSession(headers=self.headers) as http:
                async with http.get(
                    source.rss_url,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as response:
                    content = await response.text()
            
            feed = feedparser.parse(content)
            if feed.bozo and not feed.entries:
                logger.warning(f"Malformed RSS from {source.name}: {feed.bozo_exception}")
                return 0

            new_count = 0
            entries = feed.entries[:settings.max_articles_per_source]
            
            async with self.session_factory() as db:
                for entry in entries:
                    article_url = getattr(entry, "link", None)
                    if not article_url:
                        continue
                    
                    # Check dedup
                    h = url_hash(article_url)
                    existing = await db.execute(
                        select(Article.id).where(Article.url_hash == h)
                    )
                    if existing.scalar_one_or_none():
                        continue
                    
                    # Extract full text
                    full_text = await self._extract_full_text(article_url)
                    
                    # Skip too-short articles
                    if full_text and len(full_text) < settings.min_article_length:
                        continue
                    
                    # Detect language
                    detected_lang = self._detect_language(
                        full_text or entry.get("title", ""),
                        source.languages
                    )
                    
                    article = Article(
                        media_source_id=source.id,
                        url=article_url,
                        url_hash=h,
                        title_original=entry.get("title", "Untitled"),
                        content_original=full_text,
                        author=self._extract_author(entry),
                        published_at=parse_date(entry),
                        source_language=detected_lang,
                        status="collected",
                        word_count=len(full_text.split()) if full_text else None,
                    )
                    db.add(article)
                    new_count += 1
                
                await db.commit()
            
            # Rate limiting
            await asyncio.sleep(settings.request_delay_seconds)
            
            # Update last_collected_at
            async with self.session_factory() as db:
                source_obj = await db.get(MediaSource, source.id)
                if source_obj:
                    source_obj.last_collected_at = datetime.now(timezone.utc)
                    await db.commit()
            
            logger.info(f"Collected {new_count} new articles from {source.name}")
            return new_count

    async def _extract_full_text(self, url: str) -> Optional[str]:
        """Extract article full text using trafilatura."""
        try:
            downloaded = trafilatura.fetch_url(url)
            if not downloaded:
                return None
            result = trafilatura.extract(
                downloaded,
                include_comments=False,
                include_tables=False,
                favor_recall=True,
                output_format="txt",
            )
            return result
        except Exception as e:
            logger.warning(f"Failed to extract text from {url}: {e}")
            return None

    def _detect_language(self, text: str, source_languages: list) -> str:
        """Detect language using py3langid with source hint."""
        try:
            import py3langid
            lang, _ = py3langid.classify(text)
            return lang
        except Exception:
            return source_languages[0] if source_languages else "unknown"

    def _extract_author(self, entry) -> Optional[str]:
        """Extract author from RSS entry."""
        if hasattr(entry, "author"):
            return entry.author
        if hasattr(entry, "authors") and entry.authors:
            return entry.authors[0].get("name", None)
        return None


async def run_collection():
    """Entry point for the collection job."""
    collector = RSSCollector()
    return await collector.collect_all()
