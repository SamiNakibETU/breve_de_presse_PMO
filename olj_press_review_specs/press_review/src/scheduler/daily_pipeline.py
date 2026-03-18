"""
OLJ Press Review — Daily Pipeline Scheduler
Orchestrates the daily collection and processing pipeline.
"""

import asyncio
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.config import get_settings
from src.collectors.rss_collector import run_collection
from src.processors.translator import run_translation_pipeline

logger = logging.getLogger(__name__)
settings = get_settings()


async def daily_pipeline():
    """Run the complete daily pipeline: collect → translate."""
    start = datetime.now(timezone.utc)
    logger.info(f"=== Daily pipeline started at {start.isoformat()} ===")

    # Step 1: Collect from all RSS sources
    logger.info("Step 1/2: Collecting articles...")
    collection_stats = await run_collection()
    logger.info(f"Collection stats: {collection_stats}")

    # Step 2: Translate and summarize new articles
    logger.info("Step 2/2: Translating and summarizing...")
    translation_stats = await run_translation_pipeline()
    logger.info(f"Translation stats: {translation_stats}")

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    logger.info(f"=== Daily pipeline completed in {elapsed:.1f}s ===")

    return {
        "collection": collection_stats,
        "translation": translation_stats,
        "elapsed_seconds": elapsed,
    }


def create_scheduler() -> AsyncIOScheduler:
    """Create and configure the daily scheduler."""
    scheduler = AsyncIOScheduler()

    # Main daily run at configured hour (default 06:00 UTC = 08:00 Beirut)
    scheduler.add_job(
        daily_pipeline,
        trigger=CronTrigger(hour=settings.collection_hour_utc, minute=0),
        id="daily_pipeline",
        name="Daily Press Collection & Processing",
        replace_existing=True,
    )

    # Optional: second run at 14:00 UTC for afternoon updates
    scheduler.add_job(
        daily_pipeline,
        trigger=CronTrigger(hour=14, minute=0),
        id="afternoon_pipeline",
        name="Afternoon Update Collection",
        replace_existing=True,
    )

    logger.info(
        f"Scheduler configured: daily at {settings.collection_hour_utc}:00 UTC and 14:00 UTC"
    )
    return scheduler


# ─── FastAPI integration ──────────────────────────────────────────
# Used by main.py to start scheduler alongside the API

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(daily_pipeline())
