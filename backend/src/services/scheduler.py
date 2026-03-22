"""
Daily pipeline scheduler using APScheduler AsyncIOScheduler.
Runs collection + translation + embedding + clustering at 06:00 and 14:00 UTC.
"""

import time
from datetime import datetime, timezone
from typing import Callable, Optional

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.config import get_settings
from src.database import get_session_factory
from src.services.collector import run_collection
from src.services.translator import run_translation_pipeline

logger = structlog.get_logger(__name__)
settings = get_settings()


async def daily_pipeline(
    on_progress: Optional[Callable[[str, str], None]] = None,
) -> dict:
    def p(key: str, label: str) -> None:
        if on_progress:
            on_progress(key, label)

    start = datetime.now(timezone.utc)
    logger.info("pipeline.start", time=start.isoformat())

    logger.info("pipeline.step", step="collect")
    p("collection", "Collecte (RSS et scrapers)…")

    def collect_pb(k: str, lbl: str) -> None:
        p(f"collection.{k}", f"Collecte · {lbl}")

    step_timings: dict[str, float] = {}

    t0 = time.monotonic()
    collection_stats = await run_collection(
        on_progress=collect_pb if on_progress else None,
    )
    step_timings["collection_s"] = round(time.monotonic() - t0, 2)

    logger.info("pipeline.step", step="translate")
    p("translation", "Traduction et résumés (LLM)…")

    def translate_pb(k: str, lbl: str) -> None:
        p(f"translation.{k}", f"Traduction · {lbl}")

    t1 = time.monotonic()
    translation_stats = await run_translation_pipeline(
        on_progress=translate_pb if on_progress else None,
    )
    step_timings["translation_s"] = round(time.monotonic() - t1, 2)

    pipeline_result: dict = {
        "collection": collection_stats,
        "translation": translation_stats,
        "step_timings": step_timings,
    }

    try:
        from src.services.dedup_surface import run_surface_dedup
        from src.services.edition_schedule import resolve_edition_id_for_timestamp

        factory = get_session_factory()
        async with factory() as db:
            eid = await resolve_edition_id_for_timestamp(
                db, datetime.now(timezone.utc)
            )
            dedup_stats = await run_surface_dedup(db, edition_id=eid)
            await db.commit()
        pipeline_result["dedup_surface"] = dedup_stats
        pipeline_result["edition_id"] = str(eid) if eid else None
    except Exception as e:
        logger.warning("pipeline.dedup_surface_failed", error=str(e)[:200])
        pipeline_result["dedup_surface"] = {"error": str(e)[:200]}
    try:
        from src.services.source_health_metrics import refresh_translation_metrics_24h

        factory = get_session_factory()
        async with factory() as db:
            n_touch = await refresh_translation_metrics_24h(db)
            await db.commit()
        pipeline_result["translation_health_metrics"] = {"sources_updated": n_touch}
    except Exception as e:
        logger.warning(
            "pipeline.translation_health_metrics_failed",
            error=str(e)[:200],
        )
        pipeline_result["translation_health_metrics"] = {"error": str(e)[:200]}

    cohere_key = settings.cohere_api_key
    if not cohere_key:
        logger.error(
            "pipeline.cohere_key_missing",
            message="COHERE_API_KEY not set — embedding and clustering SKIPPED. "
            "Set it in Railway environment variables.",
        )
        p("embedding", "Embeddings — clé Cohere absente, étape ignorée")
        pipeline_result["embedding"] = {"error": "COHERE_API_KEY not configured"}
    else:
        try:
            from src.services.cluster_labeller import label_clusters
            from src.services.clustering_service import ClusteringService
            from src.services.embedding_service import EmbeddingService

            from src.services.edition_schedule import resolve_edition_id_for_timestamp
            from src.services.semantic_dedupe import run_semantic_dedup

            factory = get_session_factory()
            async with factory() as db:
                t_emb = time.monotonic()
                p("embedding", "Embeddings articles en attente (Cohere)…")
                embedding_service = EmbeddingService()
                embedded = await embedding_service.embed_pending_articles(db)
                pipeline_result["embedding"] = {"embedded": embedded}
                step_timings["embedding_s"] = round(time.monotonic() - t_emb, 2)
                logger.info("pipeline.embedding_done", embedded=embedded)

                from src.services.simhash_dedupe import (
                    mark_syndicated_from_bodies,
                    mark_syndicated_from_summaries,
                )

                t_sy = time.monotonic()
                syndicated_sum = await mark_syndicated_from_summaries(db)
                syndicated_body = await mark_syndicated_from_bodies(db)
                pipeline_result["syndication"] = {
                    "marked_syndicated_summaries": syndicated_sum,
                    "marked_syndicated_bodies": syndicated_body,
                }
                step_timings["syndication_s"] = round(time.monotonic() - t_sy, 2)

                eid = await resolve_edition_id_for_timestamp(
                    db, datetime.now(timezone.utc)
                )
                t_sem = time.monotonic()
                sem_dedup = await run_semantic_dedup(db, edition_id=eid)
                pipeline_result["dedup_semantic"] = sem_dedup
                step_timings["dedup_semantic_s"] = round(time.monotonic() - t_sem, 2)

                t_cl = time.monotonic()
                p("clustering", "Regroupement thématique (HDBSCAN)…")
                clustering_service = ClusteringService()
                clustering_result = await clustering_service.run_clustering(
                    db, edition_id=eid
                )
                pipeline_result["clustering"] = clustering_result
                step_timings["clustering_s"] = round(time.monotonic() - t_cl, 2)
                logger.info("pipeline.clustering_done", **clustering_result)

                t_lb = time.monotonic()
                p("labelling", "Libellés sujets (LLM)…")
                labeled = await label_clusters(db)
                pipeline_result["labelling"] = {"labeled": labeled}
                step_timings["labelling_s"] = round(time.monotonic() - t_lb, 2)
                logger.info("pipeline.labelling_done", labeled=labeled)
        except Exception as e:
            logger.error("pipeline.embedding_clustering_failed", error=str(e))
            p("embedding", f"Erreur embeddings / clusters : {str(e)[:80]}")
            pipeline_result["embedding"] = {"error": str(e)}

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    pipeline_result["elapsed_seconds"] = elapsed
    p("done", "Pipeline terminé")
    logger.info("pipeline.complete", elapsed_seconds=elapsed)

    hou = datetime.now(timezone.utc).hour
    if (
        settings.anthropic_batch_enabled
        and (settings.anthropic_api_key or "").strip()
        and hou == settings.collection_hour_utc
    ):
        try:
            from src.services.anthropic_batch import run_batch_hook

            factory = get_session_factory()
            async with factory() as db:
                pipeline_result["anthropic_batch"] = await run_batch_hook(db)
        except Exception as e:
            logger.warning("pipeline.anthropic_batch_failed", error=str(e)[:200])
            pipeline_result["anthropic_batch"] = {"error": str(e)[:200]}

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

    try:
        from src.services.edition_schedule import ensure_next_day_edition_job

        scheduler.add_job(
            ensure_next_day_edition_job,
            trigger=CronTrigger(hour=0, minute=0, timezone="Asia/Beirut"),
            id="edition_daily_create_beirut",
            name="Create next-day edition (00:00 Asia/Beirut)",
            replace_existing=True,
        )
    except Exception as exc:
        logger.warning("scheduler.edition_job_failed", error=str(exc)[:200])

    logger.info(
        "scheduler.configured",
        morning=f"{settings.collection_hour_utc}:00 UTC",
        afternoon="14:00 UTC",
        edition_cron="00:00 Asia/Beirut",
    )
    return scheduler
