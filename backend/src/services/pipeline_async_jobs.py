"""Exécution de tâches pipeline en arrière-plan (mise à jour du task store)."""

from __future__ import annotations

from src.database import get_session_factory
from src.services import pipeline_task_store as task_store
from src.services.cluster_labeller import label_clusters
from src.services.clustering_service import ClusteringService
from src.services.collector import run_collection
from src.services.embedding_service import EmbeddingService
from src.services.scheduler import daily_pipeline
from src.services.translator import run_translation_pipeline


async def execute_collect_task(task_id: str) -> None:
    try:

        def on_progress(step_key: str, step_label: str) -> None:
            task_store.update_step(task_id, step_key, step_label)

        stats = await run_collection(on_progress=on_progress)
        task_store.finish_ok(task_id, {"status": "ok", "stats": stats})
    except Exception as exc:  # noqa: BLE001
        task_store.finish_error(task_id, str(exc))


async def execute_translate_task(task_id: str, translate_limit: int) -> None:
    try:

        def on_progress(step_key: str, step_label: str) -> None:
            task_store.update_step(task_id, step_key, step_label)

        stats = await run_translation_pipeline(
            limit=translate_limit,
            on_progress=on_progress,
        )
        task_store.finish_ok(task_id, {"status": "ok", "stats": stats})
    except Exception as exc:  # noqa: BLE001
        task_store.finish_error(task_id, str(exc))


async def execute_refresh_clusters_task(task_id: str) -> None:
    try:

        def on_progress(step_key: str, step_label: str) -> None:
            task_store.update_step(task_id, step_key, step_label)

        factory = get_session_factory()
        async with factory() as db:
            on_progress("embedding", "Embeddings articles en attente…")
            embedding_service = EmbeddingService()
            embedded = await embedding_service.embed_pending_articles(db)

            on_progress("clustering", "Regroupement (HDBSCAN)…")
            clustering_service = ClusteringService()
            clustering_result = await clustering_service.run_clustering(db)

            on_progress("labelling", "Libellés sujets (LLM)…")
            labeled = await label_clusters(db)

        result = {
            "clusters_created": clustering_result["clusters_created"],
            "articles_clustered": clustering_result["articles_clustered"],
            "articles_embedded": embedded,
            "clusters_labeled": labeled,
        }
        task_store.finish_ok(task_id, result)
    except Exception as exc:  # noqa: BLE001
        task_store.finish_error(task_id, str(exc))


async def execute_full_pipeline_task(task_id: str) -> None:
    try:

        def on_progress(step_key: str, step_label: str) -> None:
            task_store.update_step(task_id, step_key, step_label)

        stats = await daily_pipeline(on_progress=on_progress)
        task_store.finish_ok(task_id, {"status": "ok", "stats": stats})
    except Exception as exc:  # noqa: BLE001
        task_store.finish_error(task_id, str(exc))


async def execute_pipeline_task(
    task_id: str,
    kind: str,
    translate_limit: int,
) -> None:
    if kind == "collect":
        await execute_collect_task(task_id)
    elif kind == "translate":
        await execute_translate_task(task_id, translate_limit)
    elif kind == "refresh_clusters":
        await execute_refresh_clusters_task(task_id)
    elif kind == "full_pipeline":
        await execute_full_pipeline_task(task_id)
    else:
        task_store.finish_error(task_id, f"type de tâche inconnu : {kind}")
