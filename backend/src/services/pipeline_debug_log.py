"""Persistance des rapports d’étape pipeline (`pipeline_debug_logs`) pour la régie MEMW."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_session_factory
from src.models.edition import PipelineDebugLog

logger = structlog.get_logger(__name__)


async def resolve_current_edition_id() -> UUID | None:
    """Édition courante (Beyrouth) pour rattacher les logs technique."""
    from src.services.edition_schedule import resolve_edition_id_for_timestamp

    try:
        factory = get_session_factory()
        async with factory() as db:
            return await resolve_edition_id_for_timestamp(
                db, datetime.now(timezone.utc)
            )
    except Exception:
        return None


async def append_pipeline_debug_log(
    db: AsyncSession,
    edition_id: UUID | None,
    step: str,
    payload: dict[str, Any],
) -> None:
    """Ajoute une ligne et valide la transaction (commit)."""
    db.add(
        PipelineDebugLog(
            edition_id=edition_id,
            step=step,
            payload=payload,
        )
    )
    await db.commit()


async def log_pipeline_step(
    edition_id: UUID | None,
    step: str,
    payload: dict[str, Any],
) -> None:
    """
    Session dédiée : n’interfère pas avec une session longue du pipeline
    (embeddings / clustering sur la même connexion).
    """
    try:
        factory = get_session_factory()
        async with factory() as db:
            await append_pipeline_debug_log(db, edition_id, step, payload)
    except Exception as e:
        logger.warning(
            "pipeline_debug_log.failed",
            step=step,
            edition_id=str(edition_id) if edition_id else None,
            error=str(e)[:300],
        )


def compact_payload(data: dict[str, Any], *, max_keys: int = 48) -> dict[str, Any]:
    """Évite les payloads énormes (tronque les clés excessives si besoin)."""
    if len(data) <= max_keys:
        return data
    keys = list(data.keys())[:max_keys]
    return {k: data[k] for k in keys}
