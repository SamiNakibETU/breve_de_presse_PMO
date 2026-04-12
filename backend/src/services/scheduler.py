"""
Planificateur pipeline : APScheduler AsyncIOScheduler.

- Lundi 9h Europe/Paris : passage « week-end » (fenêtre éditoriale large).
- Mardi–vendredi 9h Europe/Paris : un seul passage par jour ouvré.
- Plus de second passage 14h UTC.
- Samedi–dimanche (même créneau Paris) : collecte seule si ``weekend_collect_enabled`` (journal
  ``weekend_collect``, hors reprise auto. du pipeline).
- Minuit Asia/Beirut : création de l’édition du lendemain ouvré.

Verrou asyncio (processus) + lease Postgres (multi-réplicas) + budgets de temps par étape.
"""

import asyncio
import time
import uuid
from contextlib import suppress
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional, TypeVar
from uuid import UUID
from zoneinfo import ZoneInfo

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from src.config import get_settings
from src.database import get_session_factory
from src.services.collector import run_collection
from src.services.metrics import record_pipeline_run, record_pipeline_step
from src.services.dedup_surface import JACCARD_THRESHOLD, NUM_PERM
from src.services.pipeline_debug_log import (
    compact_payload,
    log_pipeline_step,
    resolve_current_edition_id,
)
from src.services.pipeline_execution_lease import (
    release_daily_pipeline_lease,
    renew_daily_pipeline_lease,
    try_acquire_daily_pipeline_lease,
)
from src.services.translator import run_translation_pipeline

logger = structlog.get_logger(__name__)
settings = get_settings()

_PARIS_TZ = ZoneInfo("Europe/Paris")

_pipeline_lock = asyncio.Lock()

T = TypeVar("T")

_last_stall_alert_monotonic: float = 0.0


class PipelineBusyError(Exception):
    """Un pipeline complet tient déjà le verrou (cron, autre tâche ou POST /api/pipeline)."""


class PipelineStepTimeout(Exception):
    """Une étape a dépassé son budget ``asyncio.wait_for``."""

    def __init__(self, step: str) -> None:
        self.step = step
        super().__init__(step)


def is_pipeline_running() -> bool:
    """Verrou asyncio local uniquement (pas d’accès base). Voir ``pipeline_is_busy_async``."""
    return _pipeline_lock.locked()


async def pipeline_is_busy_async() -> bool:
    """True si ce processus exécute un pipeline ou si un lease Postgres actif existe."""
    if _pipeline_lock.locked():
        return True
    from src.services.pipeline_execution_lease import is_daily_pipeline_lease_held_alive

    try:
        return await is_daily_pipeline_lease_held_alive()
    except Exception as exc:
        logger.warning("pipeline.busy_check_failed", error=str(exc)[:200])
        return _pipeline_lock.locked()


async def _run_step_budget(
    step_name: str,
    trigger: str,
    budget_s: int,
    factory: Callable[[], Awaitable[T]],
) -> T:
    if budget_s <= 0:
        return await factory()
    try:
        return await asyncio.wait_for(factory(), timeout=float(budget_s))
    except asyncio.TimeoutError:
        eid_log = await resolve_current_edition_id()
        await log_pipeline_step(
            eid_log,
            "pipeline_step_timeout",
            compact_payload({"step": step_name, "trigger": trigger, "budget_s": budget_s}),
        )
        try:
            from src.services.alerts import post_pipeline_step_timeout_alert

            await post_pipeline_step_timeout_alert(
                step=step_name,
                timeout_s=budget_s,
                trigger=trigger,
            )
        except Exception as alert_exc:
            logger.warning(
                "pipeline.step_timeout_alert_failed",
                error=str(alert_exc)[:200],
            )
        raise PipelineStepTimeout(step_name) from None


async def _pipeline_heartbeat_loop(holder_id: str, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=float(settings.pipeline_heartbeat_interval_seconds))
            return
        except asyncio.TimeoutError:
            ok = await renew_daily_pipeline_lease(
                holder_id=holder_id,
                ttl_seconds=settings.pipeline_lease_ttl_seconds,
            )
            if not ok:
                logger.warning(
                    "pipeline.lease_renew_failed",
                    holder=holder_id[:16],
                )


async def run_topic_detection_job_once() -> dict:
    """Détection des sujets du jour (édition calendaire Beyrouth)."""
    from src.services.edition_schedule import BEIRUT, find_edition_for_calendar_date
    from src.services.topic_detector import TopicDetector

    factory = get_session_factory()
    async with factory() as db:
        cal = datetime.now(BEIRUT).date()
        edition = await find_edition_for_calendar_date(db, cal)
        if not edition:
            return {"topics_created": 0, "note": "no_edition_for_calendar_date"}
        detector = TopicDetector()
        t0 = time.monotonic()
        n = await detector.build_edition_topics(db, edition)
        await db.refresh(edition)
        return {
            "topics_created": n,
            "duration_s": round(time.monotonic() - t0, 2),
            "edition_id": str(edition.id),
            "publish_date": edition.publish_date.isoformat(),
            "detection_status": edition.detection_status,
        }


async def pipeline_lease_stall_watch_tick() -> None:
    """Cron : alerte si lease valide mais heartbeat trop vieux."""
    global _last_stall_alert_monotonic
    from src.services.alerts import post_pipeline_stalled_alert
    from src.services.pipeline_execution_lease import fetch_daily_pipeline_lease

    try:
        snap = await fetch_daily_pipeline_lease()
    except Exception as exc:
        logger.warning("pipeline.stall_check_failed", error=str(exc)[:200])
        return
    if snap is None or not snap.holder_id or snap.heartbeat_at is None or snap.expires_at is None:
        return
    now = datetime.now(timezone.utc)
    exp = snap.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp <= now:
        return
    hb = snap.heartbeat_at
    if hb.tzinfo is None:
        hb = hb.replace(tzinfo=timezone.utc)
    age = (now - hb).total_seconds()
    if age < float(settings.pipeline_stall_alert_seconds):
        return
    if time.monotonic() - _last_stall_alert_monotonic < 3600.0:
        return
    _last_stall_alert_monotonic = time.monotonic()
    try:
        await post_pipeline_stalled_alert(
            holder_id=snap.holder_id,
            seconds_since_heartbeat=age,
            trigger_label=snap.trigger_label,
        )
    except Exception as exc:
        logger.warning("pipeline.stall_alert_failed", error=str(exc)[:200])


async def run_daily_pipeline(
    *,
    trigger: str,
    on_progress: Optional[Callable[[str, str], None]] = None,
    resume: bool = False,
) -> dict:
    """Exécute le pipeline complet ; lève PipelineBusyError si déjà en cours (hors déclencheurs cron).

    ``resume=True`` : saute collecte et/ou traduction si déjà journalisées ce jour (Asia/Beirut)
    dans ``pipeline_debug_logs`` pour l’édition courante ; inutile si ``pipeline_summary`` existe.

    Ne pas utiliser ``wait_for(lock.acquire(), timeout=0)`` : en CPython cela lève presque toujours
    ``TimeoutError`` même si le verrou est libre, ce qui bloquait tout lancement manuel.
    """
    if resume:
        from src.services.pipeline_resume import load_resume_snapshot_for_edition

        eid_pre = await resolve_current_edition_id()
        snap = await load_resume_snapshot_for_edition(eid_pre)
        if snap.has_pipeline_summary:
            logger.info(
                "pipeline.resume_noop_already_complete",
                trigger=trigger,
                edition_id=str(eid_pre) if eid_pre else None,
            )
            return {
                "skipped": True,
                "reason": "pipeline_already_complete_today",
                "trigger": trigger,
                "edition_id": str(eid_pre) if eid_pre else None,
            }

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

    holder_id = str(uuid.uuid4())
    if not await try_acquire_daily_pipeline_lease(
        holder_id=holder_id,
        trigger=trigger,
        ttl_seconds=settings.pipeline_lease_ttl_seconds,
    ):
        if trigger.startswith("cron"):
            logger.warning(
                "pipeline.skipped_lease_held",
                trigger=trigger,
            )
            return {
                "skipped": True,
                "reason": "pipeline_lease_held",
                "trigger": trigger,
            }
        raise PipelineBusyError()

    await _pipeline_lock.acquire()
    stop_hb = asyncio.Event()
    hb_task = asyncio.create_task(_pipeline_heartbeat_loop(holder_id, stop_hb))
    try:
        logger.info(
            "pipeline.lock_acquired",
            trigger=trigger,
            lease_holder=holder_id[:16],
        )
        skip_collect = False
        skip_translate = False
        if resume:
            from src.services.pipeline_resume import load_resume_snapshot_for_edition

            eid_snap = await resolve_current_edition_id()
            snap2 = await load_resume_snapshot_for_edition(eid_snap)
            skip_collect = snap2.skip_collect
            skip_translate = snap2.skip_translate
            logger.info(
                "pipeline.resume_flags",
                trigger=trigger,
                skip_collect=skip_collect,
                skip_translate=skip_translate,
                edition_id=str(eid_snap) if eid_snap else None,
            )
        pipeline_timeout_s = settings.pipeline_timeout_seconds
        try:
            return await asyncio.wait_for(
                _daily_pipeline_body(
                    on_progress,
                    skip_collect=skip_collect,
                    skip_translate=skip_translate,
                    pipeline_trigger=trigger,
                ),
                timeout=pipeline_timeout_s,
            )
        except PipelineStepTimeout as st:
            logger.error(
                "pipeline.step_timeout",
                step=st.step,
                trigger=trigger,
            )
            record_pipeline_run(trigger=trigger, outcome="error")
            return {
                "error": "pipeline_step_timeout",
                "step": st.step,
                "trigger": trigger,
            }
        except asyncio.TimeoutError:
            logger.error(
                "pipeline.timeout",
                timeout_s=pipeline_timeout_s,
                trigger=trigger,
            )
            record_pipeline_run(trigger=trigger, outcome="error")
            try:
                from src.services.alerts import post_pipeline_timeout_alert

                await post_pipeline_timeout_alert(
                    timeout_s=pipeline_timeout_s,
                    trigger=trigger,
                )
            except Exception as alert_exc:
                logger.warning(
                    "pipeline.timeout_alert_failed",
                    error=str(alert_exc)[:200],
                )
            return {
                "error": "pipeline_timeout",
                "timeout_s": pipeline_timeout_s,
                "trigger": trigger,
            }
    finally:
        stop_hb.set()
        hb_task.cancel()
        with suppress(asyncio.CancelledError):
            await hb_task
        try:
            await release_daily_pipeline_lease(holder_id=holder_id)
        except Exception as lease_exc:
            logger.warning(
                "pipeline.lease_release_failed",
                error=str(lease_exc)[:200],
            )
        _pipeline_lock.release()
        logger.info("pipeline.lock_released", trigger=trigger)


async def _daily_pipeline_body(
    on_progress: Optional[Callable[[str, str], None]] = None,
    *,
    skip_collect: bool = False,
    skip_translate: bool = False,
    pipeline_trigger: str = "unknown",
) -> dict:
    def p(key: str, label: str) -> None:
        if on_progress:
            on_progress(key, label)

    start = datetime.now(timezone.utc)
    logger.info(
        "pipeline.start",
        time=start.isoformat(),
        resume_skip_collect=skip_collect,
        resume_skip_translate=skip_translate,
    )

    step_timings: dict[str, float] = {}
    eid_log = await resolve_current_edition_id()

    def collect_pb(k: str, lbl: str) -> None:
        p(f"collection.{k}", f"Collecte · {lbl}")

    if skip_collect:
        logger.info("pipeline.resume_skip", step="collect")
        p("collection", "Collecte ignorée (reprise — déjà journalisée aujourd’hui)…")
        collection_stats = {"skipped": True, "reason": "resume"}
        step_timings["collection_s"] = 0.0
    else:
        logger.info("pipeline.step", step="collect")
        p("collection", "Collecte (RSS et scrapers)…")
        t0 = time.monotonic()

        async def _do_collect() -> dict:
            return await run_collection(
                on_progress=collect_pb if on_progress else None,
            )

        collection_stats = await _run_step_budget(
            "collect",
            pipeline_trigger,
            settings.pipeline_step_timeout_collect_s,
            _do_collect,
        )
        step_timings["collection_s"] = round(time.monotonic() - t0, 2)
        await log_pipeline_step(
            eid_log,
            "collect",
            compact_payload(
                {"stats": collection_stats, "duration_s": step_timings["collection_s"]},
            ),
        )

    def translate_pb(k: str, lbl: str) -> None:
        p(f"translation.{k}", f"Traduction · {lbl}")

    if skip_translate:
        logger.info("pipeline.resume_skip", step="translate")
        p("translation", "Traduction ignorée (reprise — déjà journalisée aujourd’hui)…")
        translation_stats = {"skipped": True, "reason": "resume"}
        step_timings["translation_s"] = 0.0
    else:
        logger.info("pipeline.step", step="translate")
        p("translation", "Traduction et résumés (LLM)…")
        t1 = time.monotonic()

        async def _do_translate() -> dict:
            return await run_translation_pipeline(
                on_progress=translate_pb if on_progress else None,
            )

        translation_stats = await _run_step_budget(
            "translate",
            pipeline_trigger,
            settings.pipeline_step_timeout_translate_s,
            _do_translate,
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

    # ── Phase post-1 : scoring, analyse, déduplication surface, santé sources ──
    async def _post_analysis_phases() -> None:
        rel_last_error: str | None = None
        for rel_attempt in range(3):
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
                rel_last_error = None
                break
            except Exception as e:
                rel_last_error = str(e)[:200]
                logger.warning(
                    "pipeline.relevance_scoring_failed",
                    attempt=rel_attempt + 1,
                    error=rel_last_error,
                )
                if rel_attempt < 2:
                    await asyncio.sleep(30.0 if rel_attempt == 0 else 60.0)
        if rel_last_error is not None:
            pipeline_result["relevance_scoring"] = {"error": rel_last_error}

        analysis_last_error: str | None = None
        for analysis_attempt in range(3):
            try:
                from src.services.article_analyst import run_article_analysis_pipeline

                eid_art = await resolve_current_edition_id()
                art_stats = await run_article_analysis_pipeline(edition_id=eid_art)
                pipeline_result["article_analysis"] = art_stats
                log_eid = eid_art or await resolve_current_edition_id()
                await log_pipeline_step(
                    log_eid,
                    "article_analysis",
                    compact_payload(art_stats),
                )
                analysis_last_error = None
                break
            except Exception as e:
                analysis_last_error = str(e)[:200]
                logger.warning(
                    "pipeline.article_analysis_failed",
                    attempt=analysis_attempt + 1,
                    error=analysis_last_error,
                )
                if analysis_attempt < 2:
                    await asyncio.sleep(30.0 if analysis_attempt == 0 else 60.0)
        if analysis_last_error is not None:
            pipeline_result["article_analysis"] = {"error": analysis_last_error}

        ded_last_error: str | None = None
        for ded_attempt in range(3):
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
                ded_last_error = None
                break
            except Exception as e:
                ded_last_error = str(e)[:200]
                logger.warning(
                    "pipeline.dedup_surface_failed",
                    attempt=ded_attempt + 1,
                    error=ded_last_error,
                )
                if ded_attempt < 2:
                    await asyncio.sleep(30.0 if ded_attempt == 0 else 60.0)
        if ded_last_error is not None:
            pipeline_result["dedup_surface"] = {"error": ded_last_error}
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

    # ── Phase post-2 : embedding, clustering, libellés, détection sujets ──
    async def _post_embedding_phases() -> None:
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

        # Détection sujets après embedding/clustering (dépendance causale)
        p("topic_detection", "Détection des développements (LLM)…")
        try:
            topic_result = await run_topic_detection_job_once()
            if topic_result.get("detection_status") == "failed":
                logger.warning(
                    "pipeline.topic_detection_retry",
                    reason="detection_status_failed",
                )
                await asyncio.sleep(60.0)
                topic_retry = await run_topic_detection_job_once()
                topic_result["retry_after_failure"] = topic_retry
            pipeline_result["topic_detection"] = topic_result
            topic_log_edition_id = None
            raw_eid = topic_result.get("edition_id")
            if isinstance(raw_eid, str):
                try:
                    topic_log_edition_id = UUID(raw_eid)
                except ValueError:
                    topic_log_edition_id = None
            if topic_log_edition_id is None:
                topic_log_edition_id = await resolve_current_edition_id()
            await log_pipeline_step(
                topic_log_edition_id,
                "topic_detection",
                compact_payload(topic_result),
            )
        except Exception as e:
            logger.warning("pipeline.topic_detection_failed", error=str(e)[:200])
            pipeline_result["topic_detection"] = {"error": str(e)[:200]}

    half_budget = settings.pipeline_step_timeout_post_s // 2 or settings.pipeline_step_timeout_post_s
    await _run_step_budget(
        "post_analysis",
        pipeline_trigger,
        half_budget,
        _post_analysis_phases,
    )
    await _run_step_budget(
        "post_embedding",
        pipeline_trigger,
        half_budget,
        _post_embedding_phases,
    )

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    pipeline_result["elapsed_seconds"] = elapsed
    p("done", "Pipeline terminé")
    logger.info("pipeline.complete", elapsed_seconds=elapsed, step_timings=step_timings)

    # Métriques Prometheus par étape
    for step_key, duration in step_timings.items():
        step_label = step_key.removesuffix("_s")
        record_pipeline_step(step_label, duration_seconds=duration)
    record_pipeline_run(trigger=pipeline_trigger, outcome="ok")

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


async def pipeline_completion_retry_tick() -> None:
    """Cron intervalle : relance ``run_daily_pipeline(resume=True)`` si matinée incomplète."""
    if settings.pipeline_completion_retry_minutes <= 0:
        return
    from src.services.pipeline_resume import should_auto_retry_completion

    now_paris = datetime.now(_PARIS_TZ)
    try:
        want = await should_auto_retry_completion(
            paris_hour=now_paris.hour,
            paris_start_hour=settings.pipeline_retry_paris_start_hour,
            paris_end_hour=settings.pipeline_retry_paris_end_hour,
        )
    except Exception as exc:
        logger.warning(
            "pipeline.completion_retry_probe_failed",
            error=str(exc)[:200],
        )
        return
    if not want:
        return
    await run_daily_pipeline(trigger="cron_completion_retry", resume=True)


async def run_weekend_collect_only(*, trigger: str) -> None:
    """
    Collecte RSS/scrapers uniquement (week-end). N’utilise pas le verrou pipeline complet.
    Journal : ``weekend_collect`` (pas ``collect``) pour ne pas fausser la reprise du lundi.
    """
    try:

        def collect_pb(k: str, lbl: str) -> None:
            logger.info(
                "weekend_collect.progress",
                step_key=k,
                step_label=(lbl[:120] if lbl else ""),
            )

        eid = await resolve_current_edition_id()
        stats = await run_collection(on_progress=collect_pb)
        await log_pipeline_step(
            eid,
            "weekend_collect",
            compact_payload({"stats": stats, "trigger": trigger}),
        )
        logger.info(
            "weekend_collect.done",
            trigger=trigger,
            edition_id=str(eid) if eid else None,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "weekend_collect.failed",
            trigger=trigger,
            error=str(exc)[:500],
        )


async def retention_cleanup_tick() -> None:
    """Nettoie les drapeaux ``retention_until`` expirés (TTL articles sélectionnés)."""
    try:
        from src.services.selected_article_retention import (
            clear_expired_retention_flags,
        )

        factory = get_session_factory()
        async with factory() as db:
            n = await clear_expired_retention_flags(db)
            await db.commit()
        logger.info("scheduler.retention_cleanup", cleared=n)
    except Exception as exc:
        logger.warning(
            "scheduler.retention_cleanup_failed",
            error=str(exc)[:200],
        )


async def selected_fulltext_translation_tick() -> None:
    """Traduction corps FR pour articles encore sélectionnés (rétention active)."""
    try:
        from src.services.selected_article_fulltext import (
            run_selected_article_fulltext_job,
        )

        res = await run_selected_article_fulltext_job()
        if not res.get("skipped"):
            logger.info("scheduler.selected_fulltext", **{k: v for k, v in res.items()})
    except Exception as exc:
        logger.warning(
            "scheduler.selected_fulltext_failed",
            error=str(exc)[:200],
        )


async def article_analysis_fill_tick() -> None:
    """Job périodique : analyse tous les articles récents non encore analysés (sans filtre édition).

    Cela couvre les articles du Panorama (clusters 48h) qui appartiennent à des éditions passées,
    ainsi que les articles collectés depuis le dernier cycle pipeline.
    """
    s = get_settings()
    if not s.article_analysis_enabled or s.article_analysis_fill_interval_minutes <= 0:
        return
    try:
        from src.services.article_analyst import run_article_analysis_pipeline

        res = await run_article_analysis_pipeline(
            edition_id=None,
            limit=s.article_analysis_fill_batch,
            recent_hours=s.article_analysis_fill_hours,
        )
        analyzed = res.get("analyzed", 0)
        if analyzed > 0 or res.get("eligible_total", 0) > 0:
            logger.info(
                "scheduler.analysis_fill",
                analyzed=analyzed,
                eligible_total=res.get("eligible_total", 0),
                skipped=res.get("skipped_articles", 0),
                errors=res.get("errors", 0),
            )
    except Exception as exc:
        logger.warning("scheduler.analysis_fill_failed", error=str(exc)[:200])


async def run_afternoon_refresh(*, trigger: str = "cron_afternoon") -> dict:
    """
    Refresh léger 16h Paris (mar.–ven.) :
    1. Re-collecte (même fenêtre d'édition élargie)
    2. Traduction des nouveaux articles uniquement
    3. Soft-assign aux clusters existants (sans re-HDBSCAN)
    4. Mise à jour métriques sources

    N'acquiert PAS le verrou pipeline principal (léger, non exclusif).
    """
    logger.info("afternoon_refresh.start", trigger=trigger)
    result: dict = {"trigger": trigger}
    eid = await resolve_current_edition_id()

    # 1. Re-collecte
    try:
        stats = await run_collection()
        result["collection"] = stats
        await log_pipeline_step(eid, "afternoon_collect", compact_payload({"stats": stats}))
    except Exception as exc:
        logger.warning("afternoon_refresh.collect_failed", error=str(exc)[:200])
        result["collection"] = {"error": str(exc)[:200]}

    # 2. Traduction nouveaux articles
    try:
        from src.services.translator import run_translation_pipeline

        t_stats = await run_translation_pipeline()
        result["translation"] = t_stats
        await log_pipeline_step(eid, "afternoon_translate", compact_payload(t_stats))
    except Exception as exc:
        logger.warning("afternoon_refresh.translate_failed", error=str(exc)[:200])
        result["translation"] = {"error": str(exc)[:200]}

    # 3. Scoring pertinence nouveaux articles
    try:
        from src.services.edition_schedule import resolve_edition_id_for_timestamp
        from src.services.relevance_scorer import run_relevance_scoring_pipeline

        factory = get_session_factory()
        async with factory() as db:
            eid_rel = await resolve_edition_id_for_timestamp(db, datetime.now(timezone.utc))
            rel_stats = await run_relevance_scoring_pipeline(db, edition_id=eid_rel)
            await db.commit()
        result["relevance_scoring"] = rel_stats
    except Exception as exc:
        logger.warning("afternoon_refresh.relevance_failed", error=str(exc)[:200])
        result["relevance_scoring"] = {"error": str(exc)[:200]}

    # 4. Soft-assign aux clusters existants (sans re-HDBSCAN)
    cohere_key = settings.cohere_api_key
    if cohere_key:
        try:
            from src.services.edition_schedule import resolve_edition_id_for_timestamp
            from src.services.embedding_service import EmbeddingService

            factory = get_session_factory()
            async with factory() as db:
                eid_emb = await resolve_edition_id_for_timestamp(db, datetime.now(timezone.utc))
                svc = EmbeddingService()
                embedded = await svc.embed_pending_articles(db)
                result["embedding"] = {"embedded": embedded}
                # Soft-assign via ClusteringService.soft_assign_new_articles si disponible
                try:
                    from src.services.clustering_service import ClusteringService

                    cs = ClusteringService()
                    if hasattr(cs, "soft_assign_new_articles"):
                        assigned = await cs.soft_assign_new_articles(db, edition_id=eid_emb)
                        result["soft_assign"] = {"assigned": assigned}
                except Exception as sa_exc:
                    logger.debug("afternoon_refresh.soft_assign_unavailable", error=str(sa_exc)[:80])
                await db.commit()
        except Exception as exc:
            logger.warning("afternoon_refresh.embed_failed", error=str(exc)[:200])
            result["embedding"] = {"error": str(exc)[:200]}
    else:
        result["embedding"] = {"skipped": "no_cohere_key"}

    logger.info("afternoon_refresh.done", trigger=trigger, result_keys=list(result.keys()))
    await log_pipeline_step(eid, "afternoon_refresh_summary", compact_payload(result))
    return result


def create_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    h = settings.pipeline_paris_morning_hour
    m = settings.pipeline_paris_morning_minute
    tz_paris = "Europe/Paris"

    async def _cron_monday() -> None:
        await run_daily_pipeline(trigger="cron_monday")

    async def _cron_weekday() -> None:
        await run_daily_pipeline(trigger="cron_weekday")

    _misfire = 3600
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
        misfire_grace_time=_misfire,
        coalesce=True,
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
        misfire_grace_time=_misfire,
        coalesce=True,
    )

    if settings.afternoon_refresh_enabled:
        ah = settings.pipeline_paris_afternoon_hour
        am = settings.pipeline_paris_afternoon_minute

        async def _cron_afternoon_refresh() -> None:
            await run_afternoon_refresh(trigger="cron_afternoon")

        scheduler.add_job(
            _cron_afternoon_refresh,
            trigger=CronTrigger(
                day_of_week="tue-fri",
                hour=ah,
                minute=am,
                timezone=tz_paris,
            ),
            id="afternoon_refresh_weekday",
            name=f"Refresh léger 16h (mar.–ven. {ah:02d}:{am:02d} Paris)",
            replace_existing=True,
            misfire_grace_time=_misfire,
            coalesce=True,
        )

    if settings.weekend_collect_enabled:

        async def _cron_weekend_collect() -> None:
            await run_weekend_collect_only(trigger="cron_weekend_collect")

        scheduler.add_job(
            _cron_weekend_collect,
            trigger=CronTrigger(
                day_of_week="sat-sun",
                hour=h,
                minute=m,
                timezone=tz_paris,
            ),
            id="weekend_collect_only",
            name=f"Collecte week-end seule (sam.–dim. {h:02d}:{m:02d} Paris)",
            replace_existing=True,
            misfire_grace_time=_misfire,
            coalesce=True,
        )

    if settings.pipeline_completion_retry_minutes > 0:
        scheduler.add_job(
            pipeline_completion_retry_tick,
            trigger=IntervalTrigger(
                minutes=settings.pipeline_completion_retry_minutes,
            ),
            id="pipeline_completion_retry",
            name=(
                f"Reprise auto. pipeline (toutes les "
                f"{settings.pipeline_completion_retry_minutes} min, Paris "
                f"{settings.pipeline_retry_paris_start_hour:02d}h–"
                f"{settings.pipeline_retry_paris_end_hour:02d}h)"
            ),
            replace_existing=True,
            misfire_grace_time=_misfire,
            coalesce=True,
        )

    scheduler.add_job(
        pipeline_lease_stall_watch_tick,
        trigger=IntervalTrigger(
            minutes=settings.pipeline_stall_check_interval_minutes,
        ),
        id="pipeline_lease_stall_watch",
        name="Surveillance heartbeat lease pipeline",
        replace_existing=True,
        misfire_grace_time=_misfire,
        coalesce=True,
    )

    try:
        from src.services.edition_schedule import ensure_next_day_edition_job

        scheduler.add_job(
            ensure_next_day_edition_job,
            trigger=CronTrigger(hour=0, minute=0, timezone="Asia/Beirut"),
            id="edition_daily_create_beirut",
            name="Create next-day edition (00:00 Asia/Beirut)",
            replace_existing=True,
            misfire_grace_time=_misfire,
            coalesce=True,
        )
    except Exception as exc:
        logger.warning("scheduler.edition_job_failed", error=str(exc)[:200])

    scheduler.add_job(
        retention_cleanup_tick,
        trigger=CronTrigger(hour=3, minute=30, timezone="Asia/Beirut"),
        id="retention_cleanup_daily",
        name="Nettoyage rétention articles sélectionnés (TTL)",
        replace_existing=True,
        misfire_grace_time=_misfire,
        coalesce=True,
    )

    if settings.selected_fulltext_job_interval_minutes > 0:
        scheduler.add_job(
            selected_fulltext_translation_tick,
            trigger=IntervalTrigger(
                minutes=settings.selected_fulltext_job_interval_minutes,
            ),
            id="selected_fulltext_translation",
            name="Traduction corps articles sélectionnés (rétention)",
            replace_existing=True,
            misfire_grace_time=_misfire,
            coalesce=True,
        )

    if settings.article_analysis_fill_interval_minutes > 0:
        scheduler.add_job(
            article_analysis_fill_tick,
            trigger=IntervalTrigger(
                minutes=settings.article_analysis_fill_interval_minutes,
            ),
            id="article_analysis_fill",
            name=(
                f"Analyse articles récents sans filtre édition "
                f"(toutes les {settings.article_analysis_fill_interval_minutes} min, "
                f"fenêtre {settings.article_analysis_fill_hours}h, "
                f"batch {settings.article_analysis_fill_batch})"
            ),
            replace_existing=True,
            misfire_grace_time=_misfire,
            coalesce=True,
        )

    logger.info(
        "scheduler.configured",
        paris_morning=f"{h:02d}:{m:02d} Europe/Paris (lun. + mar.–ven.)",
        weekend_collect=settings.weekend_collect_enabled,
        edition_cron="00:00 Asia/Beirut",
        completion_retry_minutes=settings.pipeline_completion_retry_minutes,
        stall_check_minutes=settings.pipeline_stall_check_interval_minutes,
        selected_fulltext_interval_minutes=settings.selected_fulltext_job_interval_minutes,
        analysis_fill_interval_minutes=settings.article_analysis_fill_interval_minutes,
    )
    return scheduler
