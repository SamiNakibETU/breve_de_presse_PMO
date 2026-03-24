"""
Planificateur pipeline : APScheduler AsyncIOScheduler.

- Lundi 9h Europe/Paris : passage « week-end » (fenêtre éditoriale large).
- Mardi–vendredi 9h Europe/Paris : un seul passage par jour ouvré.
- Plus de second passage 14h UTC ; pas de run samedi/dimanche.
- Minuit Asia/Beirut : création de l’édition du lendemain ouvré.

Un verrou asyncio empêche deux pipelines complets simultanés (cron / HTTP / tâche async).
"""

import asyncio
import time
from datetime import datetime, timezone
from typing import Callable, Optional
from zoneinfo import ZoneInfo

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.config import get_settings
from src.database import get_session_factory
from src.services.collector import run_collection
from src.services.dedup_surface import JACCARD_THRESHOLD, NUM_PERM
from src.services.pipeline_debug_log import (
    compact_payload,
    log_pipeline_step,
    resolve_current_edition_id,
)
from src.services.translator import run_translation_pipeline

logger = structlog.get_logger(__name__)
settings = get_settings()

_PARIS_TZ = ZoneInfo("Europe/Paris")

_pipeline_lock = asyncio.Lock()


class PipelineBusyError(Exception):
    """Un pipeline complet tient déjà le verrou (cron, autre tâche ou POST /api/pipeline)."""


def is_pipeline_running() -> bool:
    """True tant qu’un `run_daily_pipeline` est en cours (cron, tâche async ou POST synchrone)."""
    return _pipeline_lock.locked()


async def run_daily_pipeline(
    *,
    trigger: str,
    on_progress: Optional[Callable[[str, str], None]] = None,
) -> dict:
    """Exécute le pipeline complet ; lève PipelineBusyError si déjà en cours (hors déclencheurs cron).

    Ne pas utiliser ``wait_for(lock.acquire(), timeout=0)`` : en CPython cela lève presque toujours
    ``TimeoutError`` même si le verrou est libre, ce qui bloquait tout lancement manuel.
    """
    if _pipeline_lock.locked():
        if trigger.startswith("cron"):
            logger.warning(
                "pipeline.skipped_already_running",
                trigger=trigger,
            )
            return {
                "skipped": True,
                "reason": "pipeline_already_running",
                "trigger": trigger,
            }
        raise PipelineBusyError()

    await _pipeline_lock.acquire()
    try:
        logger.info("pipeline.lock_acquired", trigger=trigger)
        return await _daily_pipeline_body(on_progress)
    finally:
        _pipeline_lock.release()
        logger.info("pipeline.lock_released", trigger=trigger)


async def _daily_pipeline_body(
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

    eid_log = await resolve_current_edition_id()
    await log_pipeline_step(
        eid_log,
        "collect",
        compact_payload(
            {"stats": collection_stats, "duration_s": step_timings["collection_s"]},
        ),
    )

    logger.info("pipeline.step", step="translate")
    p("translation", "Traduction et résumés (LLM)…")

    def translate_pb(k: str, lbl: str) -> None:
        p(f"translation.{k}", f"Traduction · {lbl}")

    t1 = time.monotonic()
    translation_stats = await run_translation_pipeline(
        on_progress=translate_pb if on_progress else None,
    )
    step_timings["translation_s"] = round(time.monotonic() - t1, 2)

    await log_pipeline_step(
        eid_log,
        "translate",
        compact_payload(
            {"stats": translation_stats, "duration_s": step_timings["translation_s"]},
        ),
    )

    pipeline_result: dict = {
        "collection": collection_stats,
        "translation": translation_stats,
        "step_timings": step_timings,
    }

    try:
        from src.services.edition_schedule import resolve_edition_id_for_timestamp
        from src.services.relevance_scorer import run_relevance_scoring_pipeline

        factory = get_session_factory()
        async with factory() as db:
            eid_rel = await resolve_edition_id_for_timestamp(
                db, datetime.now(timezone.utc)
            )
            rel_stats = await run_relevance_scoring_pipeline(
                db,
                edition_id=eid_rel,
            )
            await db.commit()
        pipeline_result["relevance_scoring"] = rel_stats
        pipeline_result["edition_id_relevance"] = str(eid_rel) if eid_rel else None
        await log_pipeline_step(
            eid_rel,
            "relevance_scoring",
            compact_payload({"stats": rel_stats}),
        )
    except Exception as e:
        logger.warning("pipeline.relevance_scoring_failed", error=str(e)[:200])
        pipeline_result["relevance_scoring"] = {"error": str(e)[:200]}

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
        await log_pipeline_step(
            eid,
            "dedup_surface",
            compact_payload(
                {
                    **dedup_stats,
                    "threshold_jaccard": JACCARD_THRESHOLD,
                    "num_perm": NUM_PERM,
                },
            ),
        )
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

    async def _topic_detection_job() -> dict:
        from src.models.edition import Edition
        from src.services.edition_schedule import resolve_edition_id_for_timestamp
        from src.services.topic_detector import TopicDetector

        factory = get_session_factory()
        async with factory() as db:
            eid = await resolve_edition_id_for_timestamp(
                db, datetime.now(timezone.utc),
            )
            if not eid:
                return {"topics_created": 0, "note": "no_edition"}
            edition = await db.get(Edition, eid)
            if not edition:
                return {"topics_created": 0, "note": "edition_missing"}
            detector = TopicDetector()
            t0 = time.monotonic()
            n = await detector.build_edition_topics(db, edition)
            return {
                "topics_created": n,
                "duration_s": round(time.monotonic() - t0, 2),
            }

    p("topic_detection", "Détection des développements (LLM)…")
    topic_detection_task = asyncio.create_task(_topic_detection_job())

    cohere_key = settings.cohere_api_key
    if not cohere_key:
        logger.error(
            "pipeline.cohere_key_missing",
            message="COHERE_API_KEY not set — embedding and clustering SKIPPED. "
            "Set it in Railway environment variables.",
        )
        p("embedding", "Embeddings — clé Cohere absente, étape ignorée")
        pipeline_result["embedding"] = {"error": "COHERE_API_KEY not configured"}
        await log_pipeline_step(
            await resolve_current_edition_id(),
            "embedding_skipped",
            {"reason": "COHERE_API_KEY not configured"},
        )
    else:
        try:
            from src.services.cluster_labeller import label_clusters
            from src.services.clustering_service import ClusteringService
            from src.services.embedding_service import EmbeddingService

            from src.services.edition_schedule import resolve_edition_id_for_timestamp
            from src.services.semantic_dedupe import run_semantic_dedup

            factory = get_session_factory()
            async with factory() as db:
                eid = await resolve_edition_id_for_timestamp(
                    db, datetime.now(timezone.utc)
                )
                t_emb = time.monotonic()
                p("embedding", "Embeddings articles en attente (Cohere)…")
                embedding_service = EmbeddingService()
                embedded = await embedding_service.embed_pending_articles(db)
                pipeline_result["embedding"] = {"embedded": embedded}
                step_timings["embedding_s"] = round(time.monotonic() - t_emb, 2)
                logger.info("pipeline.embedding_done", embedded=embedded)
                await log_pipeline_step(
                    eid,
                    "embedding",
                    compact_payload(
                        {"embedded": embedded, "duration_s": step_timings["embedding_s"]},
                    ),
                )

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
                await log_pipeline_step(
                    eid,
                    "syndication_simhash",
                    compact_payload(
                        {
                            "marked_syndicated_summaries": syndicated_sum,
                            "marked_syndicated_bodies": syndicated_body,
                            "duration_s": step_timings["syndication_s"],
                        },
                    ),
                )

                t_sem = time.monotonic()
                sem_dedup = await run_semantic_dedup(db, edition_id=eid)
                pipeline_result["dedup_semantic"] = sem_dedup
                step_timings["dedup_semantic_s"] = round(time.monotonic() - t_sem, 2)
                await log_pipeline_step(
                    eid,
                    "dedup_semantic",
                    compact_payload(
                        {
                            **sem_dedup,
                            "cosine_threshold": settings.semantic_dedup_cosine,
                            "duration_s": step_timings["dedup_semantic_s"],
                        },
                    ),
                )

                t_cl = time.monotonic()
                p("clustering", "Regroupement thématique (HDBSCAN)…")
                clustering_service = ClusteringService()
                clustering_result = await clustering_service.run_clustering(
                    db, edition_id=eid
                )
                pipeline_result["clustering"] = clustering_result
                step_timings["clustering_s"] = round(time.monotonic() - t_cl, 2)
                logger.info("pipeline.clustering_done", **clustering_result)
                await log_pipeline_step(
                    eid,
                    "clustering",
                    compact_payload(
                        {
                            **clustering_result,
                            "use_umap": settings.clustering_use_umap,
                            "duration_s": step_timings["clustering_s"],
                        },
                    ),
                )

                t_lb = time.monotonic()
                p("labelling", "Libellés sujets (LLM)…")
                labeled = await label_clusters(db)
                pipeline_result["labelling"] = {"labeled": labeled}
                step_timings["labelling_s"] = round(time.monotonic() - t_lb, 2)
                logger.info("pipeline.labelling_done", labeled=labeled)
                await log_pipeline_step(
                    eid,
                    "cluster_labelling",
                    compact_payload(
                        {"labeled": labeled, "duration_s": step_timings["labelling_s"]},
                    ),
                )
        except Exception as e:
            logger.error("pipeline.embedding_clustering_failed", error=str(e))
            p("embedding", f"Erreur embeddings / clusters : {str(e)[:80]}")
            pipeline_result["embedding"] = {"error": str(e)}

    try:
        topic_result = await topic_detection_task
        pipeline_result["topic_detection"] = topic_result
        await log_pipeline_step(
            await resolve_current_edition_id(),
            "topic_detection",
            compact_payload(topic_result),
        )
    except Exception as e:
        logger.warning("pipeline.topic_detection_failed", error=str(e)[:200])
        pipeline_result["topic_detection"] = {"error": str(e)[:200]}

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    pipeline_result["elapsed_seconds"] = elapsed
    p("done", "Pipeline terminé")
    logger.info("pipeline.complete", elapsed_seconds=elapsed)

    await log_pipeline_step(
        await resolve_current_edition_id(),
        "pipeline_summary",
        compact_payload(
            {"elapsed_seconds": elapsed, "step_timings": step_timings},
        ),
    )

    now_paris = datetime.now(_PARIS_TZ)
    paris_h = now_paris.hour
    if (
        settings.anthropic_batch_enabled
        and (settings.anthropic_api_key or "").strip()
        and 8 <= paris_h < 13
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
    h = settings.pipeline_paris_morning_hour
    m = settings.pipeline_paris_morning_minute
    tz_paris = "Europe/Paris"

    async def _cron_monday() -> None:
        await run_daily_pipeline(trigger="cron_monday")

    async def _cron_weekday() -> None:
        await run_daily_pipeline(trigger="cron_weekday")

    scheduler.add_job(
        _cron_monday,
        trigger=CronTrigger(
            day_of_week="mon",
            hour=h,
            minute=m,
            timezone=tz_paris,
        ),
        id="daily_pipeline_monday",
        name=f"Pipeline week-end (lun. {h:02d}:{m:02d} Paris)",
        replace_existing=True,
    )

    scheduler.add_job(
        _cron_weekday,
        trigger=CronTrigger(
            day_of_week="tue-fri",
            hour=h,
            minute=m,
            timezone=tz_paris,
        ),
        id="daily_pipeline_weekday",
        name=f"Pipeline mar.–ven. ({h:02d}:{m:02d} Paris)",
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
        paris_morning=f"{h:02d}:{m:02d} Europe/Paris (lun. + mar.–ven.)",
        edition_cron="00:00 Asia/Beirut",
    )
    return scheduler
