"""Exécution de tâches pipeline en arrière-plan (mise à jour du task store)."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

import structlog

from src.database import get_session_factory
from src.services import pipeline_task_store as task_store
from src.config import get_settings
from src.services.cluster_labeller import label_clusters
from src.services.clustering_service import ClusteringService
from src.services.collector import run_collection
from src.services.edition_schedule import resolve_edition_id_for_timestamp
from src.services.embedding_service import EmbeddingService
from src.services.pipeline_debug_log import (
    compact_payload,
    log_pipeline_step,
    resolve_current_edition_id,
)
from src.services import pipeline_step_tasks as step_tasks
from src.services.scheduler import PipelineBusyError, run_daily_pipeline
from src.services.translator import run_translation_pipeline


def _schedule_update_step(task_id: str, step_key: str, step_label: str) -> None:
    """Appelé depuis du code synchrone sous une coroutine active (event loop ok)."""
    asyncio.create_task(task_store.update_step(task_id, step_key, step_label))


async def execute_collect_task(task_id: str) -> None:
    try:

        def on_progress(step_key: str, step_label: str) -> None:
            _schedule_update_step(task_id, step_key, step_label)

        stats = await run_collection(on_progress=on_progress)
        await log_pipeline_step(
            await resolve_current_edition_id(),
            "collect",
            compact_payload({"stats": stats, "source": "async_task"}),
        )
        await task_store.finish_ok(task_id, {"status": "ok", "stats": stats})
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_translate_task(task_id: str, translate_limit: int) -> None:
    try:

        def on_progress(step_key: str, step_label: str) -> None:
            _schedule_update_step(task_id, step_key, step_label)

        stats = await run_translation_pipeline(
            limit=translate_limit,
            on_progress=on_progress,
        )
        await log_pipeline_step(
            await resolve_current_edition_id(),
            "translate",
            compact_payload(
                {"stats": stats, "translate_limit": translate_limit, "source": "async_task"},
            ),
        )
        await task_store.finish_ok(task_id, {"status": "ok", "stats": stats})
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_refresh_clusters_task(task_id: str) -> None:
    try:

        def on_progress(step_key: str, step_label: str) -> None:
            _schedule_update_step(task_id, step_key, step_label)

        settings = get_settings()
        factory = get_session_factory()
        async with factory() as db:
            eid = await resolve_edition_id_for_timestamp(
                db, datetime.now(timezone.utc)
            )
            t0 = time.monotonic()
            on_progress("embedding", "Embeddings articles en attente…")
            embedding_service = EmbeddingService()
            embedded = await embedding_service.embed_pending_articles(db)
            emb_s = round(time.monotonic() - t0, 2)

            on_progress("clustering", "Regroupement (HDBSCAN)…")
            t1 = time.monotonic()
            clustering_service = ClusteringService()
            clustering_result = await clustering_service.run_clustering(db)
            t_after_cl = time.monotonic()
            cl_s = round(t_after_cl - t1, 2)

            on_progress("labelling", "Libellés sujets (LLM)…")
            t_lb = time.monotonic()
            labeled = await label_clusters(db)
            lab_s = round(time.monotonic() - t_lb, 2)

        await log_pipeline_step(
            eid,
            "embedding",
            compact_payload({"embedded": embedded, "duration_s": emb_s, "source": "async_task"}),
        )
        await log_pipeline_step(
            eid,
            "clustering",
            compact_payload(
                {
                    **clustering_result,
                    "use_umap": settings.clustering_use_umap,
                    "duration_s": cl_s,
                    "source": "async_task",
                },
            ),
        )
        await log_pipeline_step(
            eid,
            "cluster_labelling",
            compact_payload({"labeled": labeled, "duration_s": lab_s, "source": "async_task"}),
        )

        result = {
            "clusters_created": clustering_result["clusters_created"],
            "articles_clustered": clustering_result["articles_clustered"],
            "articles_embedded": embedded,
            "clusters_labeled": labeled,
        }
        await task_store.finish_ok(task_id, result)
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_full_pipeline_task(task_id: str) -> None:
    try:

        def on_progress(step_key: str, step_label: str) -> None:
            _schedule_update_step(task_id, step_key, step_label)

        stats = await run_daily_pipeline(
            trigger=f"task:{task_id}",
            on_progress=on_progress,
        )
        await task_store.finish_ok(task_id, {"status": "ok", "stats": stats})
    except PipelineBusyError:
        await task_store.finish_error(
            task_id,
            "Un pipeline complet est déjà en cours (planificateur ou autre lancement). Réessayez plus tard.",
        )
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_resume_pipeline_task(task_id: str) -> None:
    """Même enchaînement que le pipeline complet, avec saut collecte/traduction si déjà logués."""

    try:

        def on_progress(step_key: str, step_label: str) -> None:
            _schedule_update_step(task_id, step_key, step_label)

        stats = await run_daily_pipeline(
            trigger=f"task:{task_id}",
            on_progress=on_progress,
            resume=True,
        )
        await task_store.finish_ok(task_id, {"status": "ok", "stats": stats})
    except PipelineBusyError:
        await task_store.finish_error(
            task_id,
            "Un pipeline complet est déjà en cours (planificateur ou autre lancement). Réessayez plus tard.",
        )
    except Exception as exc:  # noqa: BLE001
        await task_store.finish_error(task_id, str(exc))


async def execute_pipeline_task(
    task_id: str,
    kind: str,
    translate_limit: int | None,
    edition_id_str: str | None = None,
    analysis_force: bool = True,
) -> None:
    structlog.contextvars.bind_contextvars(
        pipeline_task_id=task_id,
        pipeline_kind=kind,
    )
    try:
        if kind == "collect":
            await execute_collect_task(task_id)
        elif kind == "translate":
            lim = (
                translate_limit
                if translate_limit is not None
                else get_settings().translation_pipeline_batch_limit
            )
            await execute_translate_task(task_id, lim)
        elif kind == "refresh_clusters":
            await execute_refresh_clusters_task(task_id)
        elif kind == "full_pipeline":
            await execute_full_pipeline_task(task_id)
        elif kind == "resume_pipeline":
            await execute_resume_pipeline_task(task_id)
        else:
            if kind == "relevance_scoring":
                await step_tasks.execute_relevance_scoring_step_task(task_id, edition_id_str)
            elif kind == "article_analysis":
                await step_tasks.execute_article_analysis_step_task(
                    task_id,
                    edition_id_str,
                    force=analysis_force,
                )
            elif kind == "dedup_surface":
                await step_tasks.execute_dedup_surface_step_task(task_id, edition_id_str)
            elif kind == "syndication_simhash":
                await step_tasks.execute_syndication_simhash_step_task(task_id, edition_id_str)
            elif kind == "dedup_semantic":
                await step_tasks.execute_dedup_semantic_step_task(task_id, edition_id_str)
            elif kind == "embedding_only":
                await step_tasks.execute_embedding_only_step_task(task_id, edition_id_str)
            elif kind == "clustering_only":
                await step_tasks.execute_clustering_only_step_task(task_id, edition_id_str)
            elif kind == "cluster_labelling":
                await step_tasks.execute_cluster_labelling_step_task(task_id, edition_id_str)
            elif kind == "topic_detection":
                await step_tasks.execute_topic_detection_step_task(task_id, edition_id_str)
            else:
                await task_store.finish_error(
                    task_id,
                    f"type de tâche inconnu : {kind}",
                )
    finally:
        structlog.contextvars.unbind_contextvars(
            "pipeline_task_id",
            "pipeline_kind",
        )
