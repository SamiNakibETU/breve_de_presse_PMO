"""Rétention et marquage des articles sélectionnés pour les sujets d’édition (plan v2)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.models.article import Article

logger = structlog.get_logger(__name__)


async def apply_retention_for_selected_article_ids(
    db: AsyncSession,
    article_ids: list[uuid.UUID],
) -> int:
    """Définit ``retention_until`` pour les articles encore cochés."""
    s = get_settings()
    if not article_ids:
        return 0
    until = datetime.now(timezone.utc) + timedelta(hours=s.selected_article_retention_hours)
    n = 0
    for aid in article_ids:
        art = await db.get(Article, aid)
        if art is None:
            continue
        art.retention_until = until
        art.retention_reason = "topic_selection"
        n += 1
    logger.info(
        "retention.applied",
        count=n,
        until=until.isoformat(),
    )
    return n


async def clear_retention_if_unselected(
    db: AsyncSession,
    article_ids: list[uuid.UUID],
) -> None:
    """Efface la rétention pour des articles retirés de la sélection (optionnel)."""
    for aid in article_ids:
        art = await db.get(Article, aid)
        if art is None:
            continue
        if art.retention_reason == "topic_selection":
            art.retention_until = None
            art.retention_reason = None


async def clear_expired_retention_flags(db: AsyncSession) -> int:
    """Remet à zéro ``retention_until`` passé (TTL dépassé)."""
    now = datetime.now(timezone.utc)
    stmt = (
        update(Article)
        .where(
            Article.retention_until.isnot(None),
            Article.retention_until < now,
        )
        .values(retention_until=None, retention_reason=None)
    )
    res = await db.execute(stmt)
    n = int(res.rowcount or 0)
    if n:
        logger.info("retention.cleared_expired", count=n, at=now.isoformat())
    return n
