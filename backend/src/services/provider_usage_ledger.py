"""Persistance des usages facturables (ledger unique pour le dashboard coûts)."""

from __future__ import annotations

import uuid
from typing import Any, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_session_factory
from src.models.provider_usage_event import ProviderUsageEvent

logger = structlog.get_logger(__name__)


async def append_provider_usage(
    db: AsyncSession,
    *,
    kind: str,
    provider: str,
    model: str,
    operation: str,
    status: str = "ok",
    input_units: int = 0,
    output_units: int = 0,
    cost_usd_est: float = 0.0,
    duration_ms: Optional[int] = None,
    edition_id: uuid.UUID | None = None,
    article_id: uuid.UUID | None = None,
    edition_topic_id: uuid.UUID | None = None,
    meta_json: dict[str, Any] | None = None,
) -> None:
    db.add(
        ProviderUsageEvent(
            kind=kind[:32],
            provider=provider[:32],
            model=model[:160],
            operation=operation[:64],
            status=status[:16],
            input_units=max(0, int(input_units)),
            output_units=max(0, int(output_units)),
            cost_usd_est=float(cost_usd_est),
            duration_ms=duration_ms,
            edition_id=edition_id,
            article_id=article_id,
            edition_topic_id=edition_topic_id,
            meta_json=meta_json,
        )
    )
    await db.flush()


async def append_provider_usage_commit(
    *,
    kind: str,
    provider: str,
    model: str,
    operation: str,
    status: str = "ok",
    input_units: int = 0,
    output_units: int = 0,
    cost_usd_est: float = 0.0,
    duration_ms: Optional[int] = None,
    edition_id: uuid.UUID | None = None,
    article_id: uuid.UUID | None = None,
    edition_topic_id: uuid.UUID | None = None,
    meta_json: dict[str, Any] | None = None,
) -> None:
    """Session dédiée + commit (traduction parallèle, gate ingestion, topic_detector, etc.)."""
    try:
        factory = get_session_factory()
        async with factory() as db:
            await append_provider_usage(
                db,
                kind=kind,
                provider=provider,
                model=model,
                operation=operation,
                status=status,
                input_units=input_units,
                output_units=output_units,
                cost_usd_est=cost_usd_est,
                duration_ms=duration_ms,
                edition_id=edition_id,
                article_id=article_id,
                edition_topic_id=edition_topic_id,
                meta_json=meta_json,
            )
            await db.commit()
    except Exception as exc:
        logger.warning(
            "provider_usage_ledger.commit_failed",
            operation=operation,
            error=str(exc)[:200],
        )
