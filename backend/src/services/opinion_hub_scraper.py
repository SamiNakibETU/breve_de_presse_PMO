"""
Collecte par « hubs » d’opinion : fetch robuste (hub_fetch) + liens enrichis (hub_links).

Sites 100 % JS / WAF : flagger pour Playwright (playwright_scraper / SOURCE_CONFIGS).
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import structlog
from sqlalchemy import select

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.models.collection_log import CollectionLog
from src.models.media_source import MediaSource
from src.services.article_body_format import (
    is_acceptable_article_title,
    is_substantial_article_body,
)
from src.services.editorial_scope import should_ingest_scraped_article
from src.services.hub_collect import fetch_html_and_extract_hub_links
from src.services.hub_article_extract import extract_hub_article_page
from src.services.hub_playwright import HubPlaywrightBrowser
from src.services.opinion_hub_overrides import merge_hub_override
from src.services.web_scraper import _detect_language, _url_hash

logger = structlog.get_logger(__name__)
settings = get_settings()


class OpinionHubScraper:
    def __init__(self) -> None:
        self._factory = get_session_factory()
        self._semaphore = asyncio.Semaphore(3)
        self._domain_last_request: dict[str, float] = {}
        self._pw_browser = HubPlaywrightBrowser()
        self._pw_lock = asyncio.Lock()

    async def scrape_all(self) -> dict:
        async with self._factory() as db:
            result = await db.execute(
                select(MediaSource).where(
                    MediaSource.is_active.is_(True),
                    MediaSource.collection_method == "opinion_hub",
                    MediaSource.opinion_hub_urls_json.isnot(None),
                )
            )
            sources = result.scalars().all()

        sources = [s for s in sources if (s.opinion_hub_urls_json or "").strip()]
        logger.info("opinion_hub.start", count=len(sources))

        try:
            tasks = [self._scrape_source(s) for s in sources]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            await self._pw_browser.stop()

        stats: dict = {
            "total_sources": len(sources),
            "total_new": 0,
            "total_filtered": 0,
            "total_skipped_short": 0,
            "errors": [],
        }
        for source, res in zip(sources, results):
            if isinstance(res, Exception):
                stats["errors"].append({"source": source.id, "error": str(res)[:200]})
                logger.error("opinion_hub.source_error", source=source.id, error=str(res)[:200])
            elif isinstance(res, dict):
                stats["total_new"] += int(res.get("new", 0))
                stats["total_filtered"] += int(res.get("filtered", 0))
                stats["total_skipped_short"] += int(res.get("skipped_short", 0))

        logger.info(
            "opinion_hub.complete",
            total_new=stats["total_new"],
            skipped_short=stats["total_skipped_short"],
            errors=len(stats["errors"]),
        )
        return stats

    async def _rate_limit(self, domain: str) -> None:
        last = self._domain_last_request.get(domain, 0)
        elapsed = time.monotonic() - last
        delay = max(settings.request_delay_seconds, 2.5)
        if elapsed < delay:
            await asyncio.sleep(delay - elapsed)
        self._domain_last_request[domain] = time.monotonic()

    async def _scrape_source(self, source: MediaSource) -> dict:
        async with self._semaphore:
            try:
                hubs: list[str] = json.loads(source.opinion_hub_urls_json or "[]")
            except json.JSONDecodeError:
                logger.warning("opinion_hub.bad_json", source=source.id)
                return {"new": 0, "filtered": 0, "skipped_short": 0, "target": 0}

            if not hubs:
                return {"new": 0, "filtered": 0, "skipped_short": 0, "target": 0}

            domain = urlparse(hubs[0]).netloc
            await self._rate_limit(domain)

            log = CollectionLog(media_source_id=source.id, status="running")
            async with self._factory() as db:
                db.add(log)
                await db.commit()
                await db.refresh(log)
            log_id = log.id

            try:
                result = await self._do_scrape(source, hubs)

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
                    "opinion_hub.source_done",
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
                raise

    async def _do_scrape(self, source: MediaSource, hub_urls: list[str]) -> dict:
        per_source_cap = settings.max_articles_per_source
        target_new = min(settings.opinion_hub_min_articles_saved, per_source_cap)
        max_attempts = min(settings.opinion_hub_max_article_url_attempts, per_source_cap * 4)
        link_budget = max(max_attempts + 30, per_source_cap + 40)

        article_urls: list[str] = []
        seen: set[str] = set()

        base_override = merge_hub_override(source.id, hub_urls[0] if hub_urls else "")
        extras = base_override.get("additional_hub_urls")
        if isinstance(extras, list):
            extra_urls = [u for u in extras if isinstance(u, str) and u.strip()]
            hub_urls = list(dict.fromkeys([*hub_urls, *extra_urls]))

        for hub in hub_urls:
            if len(article_urls) >= link_budget:
                break
            d = urlparse(hub).netloc
            await self._rate_limit(d)

            take = link_budget - len(article_urls)
            links, meta = await fetch_html_and_extract_hub_links(
                hub,
                source.id,
                max_links=take + 20,
                min_links=3,
                pw=self._pw_browser,
                pw_lock=self._pw_lock,
            )
            if not links:
                logger.warning(
                    "opinion_hub.hub_fetch_fail",
                    source=source.id,
                    url=hub[:120],
                    error=meta.get("fetch_error", ""),
                    strategy=meta.get("strategy", ""),
                )
                continue

            for u in links:
                if u not in seen:
                    seen.add(u)
                    article_urls.append(u)
                if len(article_urls) >= link_budget:
                    break

        if not article_urls:
            logger.warning("opinion_hub.no_links", source=source.id)
            return {"new": 0, "filtered": 0, "skipped_short": 0, "target": target_new}

        min_chars = max(settings.min_article_length, 180)
        min_words = settings.opinion_hub_min_article_words

        new_count = 0
        filtered_count = 0
        skipped_short = 0
        async with self._factory() as db:
            for article_url in article_urls[:max_attempts]:
                if new_count >= target_new:
                    break
                h = _url_hash(article_url)
                exists = await db.execute(select(Article.id).where(Article.url_hash == h))
                if exists.scalar_one_or_none():
                    continue

                d = urlparse(article_url).netloc
                await self._rate_limit(d)

                text, author, title, pub_date = await self._extract_article(article_url)
                if not is_substantial_article_body(
                    text or "",
                    min_chars=min_chars,
                    min_words=min_words,
                ):
                    skipped_short += 1
                    continue
                if not is_acceptable_article_title(title):
                    skipped_short += 1
                    continue
                if not should_ingest_scraped_article(title or "", text or ""):
                    filtered_count += 1
                    continue

                lang = _detect_language(
                    text or "",
                    list(source.languages or ["en"]),
                    source.country_code,
                )

                db.add(
                    Article(
                        media_source_id=source.id,
                        url=article_url,
                        url_hash=h,
                        title_original=(title or "Untitled").strip(),
                        content_original=text or "",
                        author=author,
                        published_at=pub_date,
                        source_language=lang,
                        status="collected",
                        word_count=len((text or "").split()),
                    )
                )
                new_count += 1

            await db.commit()

        if new_count < target_new:
            logger.warning(
                "opinion_hub.below_article_target",
                source=source.id,
                new=new_count,
                target=target_new,
                skipped_short=skipped_short,
                filtered=filtered_count,
                candidates=len(article_urls),
            )

        return {
            "new": new_count,
            "filtered": filtered_count,
            "skipped_short": skipped_short,
            "target": target_new,
        }

    async def _extract_article(
        self, url: str
    ) -> tuple[Optional[str], Optional[str], Optional[str], Optional[datetime]]:
        try:
            body, author, title, pub_date, _strat = await extract_hub_article_page(
                url,
                pw=self._pw_browser,
                pw_lock=self._pw_lock,
            )
            return body, author, title, pub_date
        except Exception as exc:
            logger.debug("opinion_hub.article_fail", url=url, error=str(exc)[:80])
            return None, None, None, None


async def run_opinion_hub_scraping() -> dict:
    return await OpinionHubScraper().scrape_all()
