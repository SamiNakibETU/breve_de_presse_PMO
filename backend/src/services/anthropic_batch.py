"""
File batch Anthropic (Messages Batches) pour articles `collected` — MEMW §2.2.6.

Activé si ANTHROPIC_BATCH_ENABLED et clé API. Soumission au run pipeline 06h UTC ;
finalisation au run suivant (polling statut + JSONL résultats).
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

import anthropic
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.models.article import Article
from src.models.media_source import MediaSource
from src.models.pipeline_job import PipelineJob
from src.services.translator import (
    TranslationPipeline,
    _augmented_system_prompt,
    _build_french_prompt,
    _build_translate_prompt,
    _is_middleeasteye_french_url,
)

logger = structlog.get_logger(__name__)

_BATCH_KIND = "anthropic_translation_batch"
_BATCH_BETAS = ["message-batches-2024-09-24"]


def _message_text_from_beta_message(msg: Any) -> str:
    chunks: list[str] = []
    for block in getattr(msg, "content", []) or []:
        t = getattr(block, "text", None)
        if t:
            chunks.append(t)
    return "".join(chunks).strip()


def _sync_submit_batch(requests: list[dict]) -> str:
    s = get_settings()
    client = anthropic.Anthropic(api_key=s.anthropic_api_key)
    batch = client.beta.messages.batches.create(
        requests=requests,
        betas=_BATCH_BETAS,
    )
    return batch.id


def _sync_retrieve_batch(batch_id: str) -> Any:
    client = anthropic.Anthropic(api_key=get_settings().anthropic_api_key)
    return client.beta.messages.batches.retrieve(batch_id, betas=_BATCH_BETAS)


def _sync_list_results(batch_id: str) -> list[Any]:
    client = anthropic.Anthropic(api_key=get_settings().anthropic_api_key)
    return list(
        client.beta.messages.batches.results(batch_id, betas=_BATCH_BETAS),
    )


async def _finalize_open_batch_jobs(db: AsyncSession) -> dict[str, Any]:
    q = await db.execute(
        select(PipelineJob).where(
            PipelineJob.kind == _BATCH_KIND,
            PipelineJob.status == "running",
        )
    )
    jobs = q.scalars().all()
    if not jobs:
        return {"finalized_jobs": 0, "articles_applied": 0}

    pipeline = TranslationPipeline()
    total_applied = 0
    finalized = 0

    for job in jobs:
        res = job.result or {}
        batch_id = res.get("batch_id")
        if not batch_id:
            continue
        meta = await asyncio.to_thread(_sync_retrieve_batch, batch_id)
        if meta.processing_status != "ended":
            logger.info(
                "anthropic_batch.still_processing",
                batch_id=batch_id,
                status=meta.processing_status,
            )
            continue

        applied = 0
        for row in await asyncio.to_thread(lambda: list(_sync_iter_results(batch_id))):
            aid = row.custom_id
            if row.result.type != "succeeded":
                logger.warning(
                    "anthropic_batch.item_failed",
                    article_id=aid,
                    result_type=row.result.type,
                )
                continue
            raw = _message_text_from_beta_message(row.result.message)
            if not raw:
                continue
            try:
                au = uuid.UUID(aid)
            except ValueError:
                continue
            article = await db.get(Article, au)
            if not article or article.status != "collected":
                continue
            source = await db.get(MediaSource, article.media_source_id)
            try:
                out = await pipeline.persist_from_llm_json_string(
                    article,
                    source,
                    raw,
                    run_cod=False,
                )
                if out is not None:
                    applied += 1
            except Exception as exc:
                logger.warning(
                    "anthropic_batch.apply_failed",
                    article_id=aid,
                    error=str(exc)[:200],
                )

        job.status = "completed"
        job.result = {
            **res,
            "finalized_at": datetime.now(timezone.utc).isoformat(),
            "articles_applied": applied,
        }
        job.updated_at = datetime.now(timezone.utc)
        total_applied += applied
        finalized += 1

    if finalized:
        await db.commit()
    return {"finalized_jobs": finalized, "articles_applied": total_applied}


async def submit_collected_translation_batch(db: AsyncSession) -> dict[str, Any]:
    s = get_settings()
    if not s.anthropic_batch_enabled or not (s.anthropic_api_key or "").strip():
        return {"queued": 0, "skipped": "disabled_or_no_key"}

    await _finalize_open_batch_jobs(db)

    pending_job = (
        await db.execute(
            select(PipelineJob).where(
                PipelineJob.kind == _BATCH_KIND,
                PipelineJob.status == "running",
            )
        )
    ).scalars().first()
    if pending_job:
        return {"queued": 0, "skipped": "batch_already_running"}

    max_n = min(max(s.anthropic_batch_max_requests, 1), 100)
    stmt = (
        select(Article)
        .where(Article.status == "collected")
        .where(Article.content_original.isnot(None))
        .order_by(Article.collected_at.asc())
        .limit(max_n)
    )
    articles = (await db.execute(stmt)).scalars().all()
    if not articles:
        return {"queued": 0, "skipped": "no_collected_articles"}

    system = _augmented_system_prompt()
    requests: list[dict] = []
    for article in articles:
        src = await db.get(MediaSource, article.media_source_id)
        media_name = src.name if src else "Unknown"
        is_fr = article.source_language == "fr" or _is_middleeasteye_french_url(
            article.url,
        )
        prompt = (
            _build_french_prompt(article, media_name)
            if is_fr
            else _build_translate_prompt(article, media_name)
        )
        en_so = (
            s.translation_english_summary_only
            and (article.source_language or "").lower() == "en"
            and not is_fr
        )
        max_tokens = min(
            8192,
            8000
            if (s.store_full_translation_fr and not is_fr and not en_so)
            else (3500 if en_so else 4096),
        )
        requests.append(
            {
                "custom_id": str(article.id),
                "params": {
                    "model": s.anthropic_translation_model,
                    "max_tokens": max_tokens,
                    "system": system,
                    "messages": [{"role": "user", "content": prompt}],
                },
            }
        )

    try:
        batch_id = await asyncio.to_thread(_sync_submit_batch, requests)
    except Exception as exc:
        logger.error("anthropic_batch.submit_failed", error=str(exc)[:300])
        return {"queued": 0, "error": str(exc)[:200]}

    job = PipelineJob(
        id=str(uuid.uuid4()),
        kind=_BATCH_KIND,
        status="running",
        step_key="anthropic.batch",
        step_label="Batch traduction Anthropic",
        result={
            "batch_id": batch_id,
            "article_ids": [str(a.id) for a in articles],
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(job)
    await db.commit()
    logger.info(
        "anthropic_batch.submitted",
        batch_id=batch_id,
        requests=len(requests),
    )
    return {"queued": len(requests), "batch_id": batch_id, "job_id": job.id}


async def enqueue_translation_jobs(_article_ids: list[str]) -> dict[str, Any]:
    """API historique : délègue à la sélection collected + submit."""
    s = get_settings()
    if not s.anthropic_batch_enabled:
        return {"queued": 0, "skipped": "anthropic_batch_disabled"}
    from src.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        return await submit_collected_translation_batch(db)


async def run_batch_hook(db: AsyncSession) -> dict[str, Any]:
    """À appeler depuis le scheduler : finalise puis soumet si possible."""
    out_final = await _finalize_open_batch_jobs(db)
    out_submit = await submit_collected_translation_batch(db)
    return {"finalize": out_final, "submit": out_submit}
