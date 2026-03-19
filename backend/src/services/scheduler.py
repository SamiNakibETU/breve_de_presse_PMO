"""
Daily pipeline scheduler using APScheduler AsyncIOScheduler.
Runs collection + translation + embedding + clustering at 06:00 and 14:00 UTC.
"""

from datetime import datetime, timezone

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.config import get_settings
from src.database import get_session_factory
from src.services.collector import run_collection
from src.services.translator import run_translation_pipeline

logger = structlog.get_logger(__name__)
settings = get_settings()


async def daily_pipeline() -> dict:
    start = datetime.now(timezone.utc)
    logger.info("pipeline.start", time=start.isoformat())

    logger.info("pipeline.step", step="collect")
    collection_stats = await run_collection()

    logger.info("pipeline.step", step="translate")
    translation_stats = await run_translation_pipeline()

    pipeline_result = {
        "collection": collection_stats,
        "translation": translation_stats,
    }

    try:
        from src.services.embedding_service import EmbeddingService
        from src.services.clustering_service import ClusteringService
        from src.services.cluster_labeller import label_clusters

        factory = get_session_factory()
        async with factory() as db:
            embedding_service = EmbeddingService()
            embedded = await embedding_service.embed_pending_articles(db)
            pipeline_result["embedding"] = {"embedded": embedded}

            clustering_service = ClusteringService()
            clustering_result = await clustering_service.run_clustering(db)
            pipeline_result["clustering"] = clustering_result

            labeled = await label_clusters(db)
            pipeline_result["labelling"] = {"labeled": labeled}
    except Exception as e:
        logger.warning("embedding_clustering_skipped", error=str(e))
        pipeline_result["embedding"] = {"error": str(e)}

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    pipeline_result["elapsed_seconds"] = elapsed
    logger.info("pipeline.complete", elapsed_seconds=elapsed)

    return pipeline_result


def create_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        daily_pipeline,
        trigger=CronTrigger(hour=settings.collection_hour_utc, minute=0),
        id="daily_pipeline_morning",
        name="Morning collection & processing",
        replace_existing=True,
    )

    scheduler.add_job(
        daily_pipeline,
        trigger=CronTrigger(hour=14, minute=0),
        id="daily_pipeline_afternoon",
        name="Afternoon update",
        replace_existing=True,
    )

    logger.info(
        "scheduler.configured",
        morning=f"{settings.collection_hour_utc}:00 UTC",
        afternoon="14:00 UTC",
    )
    return scheduler
