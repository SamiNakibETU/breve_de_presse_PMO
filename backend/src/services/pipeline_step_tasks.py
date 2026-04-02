"""
Tâches pipeline unitaires (une étape à la fois) — Régie « étapes avancées ».
L’édition cible est ``edition_id`` si fourni, sinon ``resolve_edition_id_for_timestamp(now)``.

Portée ``edition_id`` (lorsque la tâche reçoit un UUID résolu) :
pertinence, analyse 5 puces, dédup surface/sémantique, clustering, détection sujets : filtrage par édition.
embedding_only, cluster_labelling, simhash : filtres SQL alignés sur ``edition_id`` (voir services).
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone

import structlog

from src.config import get_settings
from src.database import get_session_factory
from src.models.edition import Edition
from src.services import pipeline_task_store as task_store
from src.services.article_analyst import run_article_analysis_pipeline
from src.services.cluster_labeller import label_clusters
from src.services.clustering_service import ClusteringService
from src.services.dedup_surface import JACCARD_THRESHOLD, NUM_PERM, run_surface_dedup
from src.services.edition_schedule import (
    BEIRUT,
    find_edition_for_calendar_date,
    resolve_edition_id_for_timestamp,
)
from src.services.embedding_service import EmbeddingService
from src.services.pipeline_debug_log import (
    compact_payload,
    log_pipeline_step,
    resolve_current_edition_id,
)
from src.services.relevance_scorer import run_relevance_scoring_pipeline
from src.services.semantic_dedupe import run_semantic_dedup
from src.services.simhash_dedupe import mark_syndicated_from_bodies, mark_syndicated_from_summaries
from src.services.topic_detector import TopicDetector

logger = structlog.get_logger(__name__)


def _schedule_update_step(task_id: str, step_key: str, step_label: str) -> None:
    asyncio.create_task(task_store.update_step(task_id, step_key, step_label))


async def _resolve_edition_uuid(db, edition_id_str: str | None):
    if edition_id_str:
        try:
            return uuid.UUID(edition_id_str)
        except ValueError:
            return None
    return await resolve_edition_id_for_timestamp(db, datetime.now(timezone.utc))


async def execute_relevance_scoring_step_task(
    task_id: str,
    edition_id_str: str | None,
) -> None:
    try:

        def on_progress(step_key: str, step_label: str) -> None:
            _schedule_update_step(task_id, step_key, step_label)

        on_progress("relevance", "Pertinence des articles…")
        factory = get_session_factory()
        async with factory() as db:
            eid = await _resolve_edition_uuid(db, edition_id_str)
            if not eid:
                await task_store.finish_error(task_id, "edition_id introuvable")
                return
            stats = await run_relevance_scoring_pipeline(db, edition_id=eid)
            await db.commit()
        await log_pipeline_step(eid, "relevance_scoring", compact_payload({"stats": stats, "source": "step_task"}))
        await task_store.finish_ok(task_id, {"relevance_scoring": stats})
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_article_analysis_step_task(
    task_id: str,
    edition_id_str: str | None,
    *,
    force: bool,
) -> None:
    try:
        _schedule_update_step(task_id, "article_analysis", "Analyse experte (5 puces)…")
        eid_u: uuid.UUID | None = None
        if edition_id_str:
            try:
                eid_u = uuid.UUID(edition_id_str)
            except ValueError:
                await task_store.finish_error(task_id, "edition_id invalide")
                return
        else:
            eid_u = await resolve_current_edition_id()
        stats = await run_article_analysis_pipeline(edition_id=eid_u, force=force)
        log_eid = eid_u or await resolve_current_edition_id()
        if log_eid:
            await log_pipeline_step(log_eid, "article_analysis", compact_payload({**stats, "source": "step_task"}))
        await task_store.finish_ok(task_id, stats)
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_dedup_surface_step_task(task_id: str, edition_id_str: str | None) -> None:
    try:
        _schedule_update_step(task_id, "dedup_surface", "Dédoublonnage surface…")
        factory = get_session_factory()
        async with factory() as db:
            eid = await _resolve_edition_uuid(db, edition_id_str)
            if not eid:
                await task_store.finish_error(task_id, "edition_id introuvable")
                return
            stats = await run_surface_dedup(db, edition_id=eid)
            await db.commit()
        await log_pipeline_step(
            eid,
            "dedup_surface",
            compact_payload({**stats, "threshold_jaccard": JACCARD_THRESHOLD, "num_perm": NUM_PERM, "source": "step_task"}),
        )
        await task_store.finish_ok(task_id, stats)
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_syndication_simhash_step_task(task_id: str, edition_id_str: str | None) -> None:
    try:
        _schedule_update_step(task_id, "syndication", "Simhash dépêches…")
        factory = get_session_factory()
        async with factory() as db:
            eid = await _resolve_edition_uuid(db, edition_id_str)
            if not eid:
                await task_store.finish_error(task_id, "edition_id introuvable")
                return
            t0 = time.monotonic()
            syndicated_sum = await mark_syndicated_from_summaries(db, edition_id=eid)
            syndicated_body = await mark_syndicated_from_bodies(db, edition_id=eid)
            await db.commit()
            dur = round(time.monotonic() - t0, 2)
        payload = {
            "marked_syndicated_summaries": syndicated_sum,
            "marked_syndicated_bodies": syndicated_body,
            "duration_s": dur,
            "source": "step_task",
        }
        await log_pipeline_step(eid, "syndication_simhash", compact_payload(payload))
        await task_store.finish_ok(task_id, payload)
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_dedup_semantic_step_task(task_id: str, edition_id_str: str | None) -> None:
    try:
        _schedule_update_step(task_id, "dedup_semantic", "Dédoublonnage sémantique…")
        settings = get_settings()
        factory = get_session_factory()
        async with factory() as db:
            eid = await _resolve_edition_uuid(db, edition_id_str)
            if not eid:
                await task_store.finish_error(task_id, "edition_id introuvable")
                return
            t0 = time.monotonic()
            sem = await run_semantic_dedup(db, edition_id=eid)
            await db.commit()
            dur = round(time.monotonic() - t0, 2)
        await log_pipeline_step(
            eid,
            "dedup_semantic",
            compact_payload({**sem, "cosine_threshold": settings.semantic_dedup_cosine, "duration_s": dur, "source": "step_task"}),
        )
        await task_store.finish_ok(task_id, {**sem, "duration_s": dur})
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_embedding_only_step_task(task_id: str, edition_id_str: str | None) -> None:
    try:
        _schedule_update_step(task_id, "embedding", "Embeddings (Cohere)…")
        settings = get_settings()
        if not (settings.cohere_api_key or "").strip():
            await task_store.finish_error(task_id, "COHERE_API_KEY non configurée")
            return
        factory = get_session_factory()
        async with factory() as db:
            eid = await _resolve_edition_uuid(db, edition_id_str)
            if not eid:
                await task_store.finish_error(task_id, "edition_id introuvable")
                return
            t0 = time.monotonic()
            embedding_service = EmbeddingService()
            embedded = await embedding_service.embed_pending_articles(db, edition_id=eid)
            await db.commit()
            dur = round(time.monotonic() - t0, 2)
        await log_pipeline_step(eid, "embedding", compact_payload({"embedded": embedded, "duration_s": dur, "source": "step_task"}))
        await task_store.finish_ok(task_id, {"embedded": embedded, "duration_s": dur})
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_clustering_only_step_task(task_id: str, edition_id_str: str | None) -> None:
    try:
        _schedule_update_step(task_id, "clustering", "Regroupements HDBSCAN…")
        settings = get_settings()
        factory = get_session_factory()
        async with factory() as db:
            eid = await _resolve_edition_uuid(db, edition_id_str)
            if not eid:
                await task_store.finish_error(task_id, "edition_id introuvable")
                return
            t0 = time.monotonic()
            clustering_service = ClusteringService()
            result = await clustering_service.run_clustering(db, edition_id=eid)
            await db.commit()
            dur = round(time.monotonic() - t0, 2)
        await log_pipeline_step(
            eid,
            "clustering",
            compact_payload({**result, "use_umap": settings.clustering_use_umap, "duration_s": dur, "source": "step_task"}),
        )
        await task_store.finish_ok(task_id, {**result, "duration_s": dur})
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_cluster_labelling_step_task(task_id: str, edition_id_str: str | None) -> None:
    try:
        _schedule_update_step(task_id, "labelling", "Libellés clusters (LLM)…")
        factory = get_session_factory()
        async with factory() as db:
            eid = await _resolve_edition_uuid(db, edition_id_str)
            if not eid:
                await task_store.finish_error(task_id, "edition_id introuvable")
                return
            t0 = time.monotonic()
            labeled = await label_clusters(db, edition_id=eid)
            await db.commit()
            dur = round(time.monotonic() - t0, 2)
        await log_pipeline_step(eid, "cluster_labelling", compact_payload({"labeled": labeled, "duration_s": dur, "source": "step_task"}))
        await task_store.finish_ok(task_id, {"labeled": labeled, "duration_s": dur})
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_topic_detection_step_task(task_id: str, edition_id_str: str | None) -> None:
    """Grands sujets d’édition — calendrier Beyrouth « aujourd’hui » si ``edition_id`` omis."""
    try:
        _schedule_update_step(task_id, "topic_detection", "Grands sujets (LLM)…")
        factory = get_session_factory()
        async with factory() as db:
            if edition_id_str:
                try:
                    eid = uuid.UUID(edition_id_str)
                except ValueError:
                    await task_store.finish_error(task_id, "edition_id invalide")
                    return

                ed = await db.get(Edition, eid)
                if not ed:
                    await task_store.finish_error(task_id, "édition introuvable")
                    return
                detector = TopicDetector()
                t0 = time.monotonic()
                n = await detector.build_edition_topics(db, ed)
                await db.refresh(ed)
                dur = round(time.monotonic() - t0, 2)
                result = {
                    "topics_created": n,
                    "duration_s": dur,
                    "edition_id": str(ed.id),
                    "publish_date": ed.publish_date.isoformat(),
                    "detection_status": getattr(ed, "detection_status", "pending"),
                    "source": "step_task",
                }
            else:
                cal = datetime.now(BEIRUT).date()
                edition = await find_edition_for_calendar_date(db, cal)
                if not edition:
                    await task_store.finish_error(task_id, "aucune édition pour la date calendaire Beyrouth aujourd’hui")
                    return
                detector = TopicDetector()
                t0 = time.monotonic()
                n = await detector.build_edition_topics(db, edition)
                await db.refresh(edition)
                dur = round(time.monotonic() - t0, 2)
                result = {
                    "topics_created": n,
                    "duration_s": dur,
                    "edition_id": str(edition.id),
                    "publish_date": edition.publish_date.isoformat(),
                    "detection_status": getattr(edition, "detection_status", "pending"),
                    "source": "step_task",
                }
            await db.commit()
        e_log = uuid.UUID(result["edition_id"])
        await log_pipeline_step(e_log, "topic_detection", compact_payload(result))
        await task_store.finish_ok(task_id, result)
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))
