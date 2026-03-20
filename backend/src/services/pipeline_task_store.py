"""
Tâches pipeline longues : persistance PostgreSQL (compatible multi-instances Railway).

Tests : `configure_session_factory(factory)` pour injecter une session SQLite.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.database import get_session_factory
from src.models.pipeline_job import PipelineJob
from src.services import metrics as app_metrics

logger = structlog.get_logger(__name__)

MAX_TASKS = 80

_configured_factory: async_sessionmaker[AsyncSession] | None = None


def configure_session_factory(
    factory: async_sessionmaker[AsyncSession] | None,
) -> None:
    """Réservé aux tests : remplace la fabrique de sessions globale."""
    global _configured_factory
    _configured_factory = factory


def _factory() -> async_sessionmaker[AsyncSession]:
    if _configured_factory is not None:
        return _configured_factory
    return get_session_factory()


def _job_to_dict(job: PipelineJob) -> dict[str, Any]:
    return {
        "task_id": job.id,
        "kind": job.kind,
        "status": job.status,
        "step_key": job.step_key,
        "step_label": job.step_label,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }


async def _prune_oldest(session: AsyncSession) -> None:
    count = await session.scalar(select(func.count()).select_from(PipelineJob))
    if count is None or count < MAX_TASKS:
        return
    overflow = int(count) - MAX_TASKS + 1
    if overflow <= 0:
        return
    r = await session.execute(
        select(PipelineJob.id)
        .order_by(PipelineJob.created_at.asc())
        .limit(overflow),
    )
    old_ids = list(r.scalars().all())
    if old_ids:
        await session.execute(delete(PipelineJob).where(PipelineJob.id.in_(old_ids)))
        logger.info("pipeline_task_store.pruned", removed=len(old_ids))


async def create_task(kind: str) -> str:
    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    factory = _factory()
    async with factory() as session:
        await _prune_oldest(session)
        session.add(
            PipelineJob(
                id=tid,
                kind=kind,
                status="pending",
                step_key="queued",
                step_label="En file…",
                result=None,
                error=None,
                created_at=now,
                updated_at=now,
            )
        )
        await session.commit()
    app_metrics.record_pipeline_task_created(kind)
    return tid


async def update_step(task_id: str, step_key: str, step_label: str) -> None:
    factory = _factory()
    async with factory() as session:
        job = await session.get(PipelineJob, task_id)
        if not job:
            return
        job.status = "running"
        job.step_key = step_key
        job.step_label = step_label
        job.updated_at = datetime.now(timezone.utc)
        await session.commit()


async def finish_ok(task_id: str, result: dict) -> None:
    factory = _factory()
    kind = "unknown"
    duration_s: float | None = None
    now = datetime.now(timezone.utc)
    async with factory() as session:
        job = await session.get(PipelineJob, task_id)
        if not job:
            return
        kind = job.kind or "unknown"
        if job.created_at:
            created = job.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            duration_s = (now - created).total_seconds()
        job.status = "done"
        job.step_key = "done"
        job.step_label = "Terminé"
        job.result = result
        job.error = None
        job.updated_at = now
        await session.commit()
    app_metrics.record_pipeline_task_terminal(
        kind,
        status="done",
        duration_seconds=duration_s,
    )


async def finish_error(task_id: str, message: str) -> None:
    factory = _factory()
    kind = "unknown"
    duration_s: float | None = None
    now = datetime.now(timezone.utc)
    async with factory() as session:
        job = await session.get(PipelineJob, task_id)
        if not job:
            return
        kind = job.kind or "unknown"
        if job.created_at:
            created = job.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            duration_s = (now - created).total_seconds()
        job.status = "error"
        job.step_key = "error"
        job.step_label = "Erreur"
        job.error = message
        job.updated_at = now
        await session.commit()
    app_metrics.record_pipeline_task_terminal(
        kind,
        status="error",
        duration_seconds=duration_s,
    )


async def get_task(task_id: str) -> Optional[dict[str, Any]]:
    factory = _factory()
    async with factory() as session:
        job = await session.get(PipelineJob, task_id)
        return _job_to_dict(job) if job else None
