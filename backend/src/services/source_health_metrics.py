"""Agrégats traduction 24 h par source → health_metrics_json (MEMW §2.1.7)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.article import Article
from src.models.media_source import MediaSource

logger = structlog.get_logger(__name__)

_TRANSLATED_OK = (
    "translated",
    "needs_review",
    "low_quality",
    "formatted",
)
_TRANSLATION_ERR = ("error", "translation_abandoned")


async def refresh_translation_metrics_24h(db: AsyncSession) -> int:
    """
    Met à jour pour chaque source active : last_24h_translation_ok,
    last_24h_translation_errors, last_24h_translation_metrics_at dans health_metrics_json.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    ok_expr = case(
        (Article.status.in_(_TRANSLATED_OK), 1),
        else_=0,
    )
    err_expr = case(
        (Article.status.in_(_TRANSLATION_ERR), 1),
        else_=0,
    )

    agg = (
        select(
            Article.media_source_id,
            func.coalesce(func.sum(ok_expr), 0).label("ok_n"),
            func.coalesce(func.sum(err_expr), 0).label("err_n"),
        )
        .where(
            Article.processed_at.isnot(None),
            Article.processed_at >= cutoff,
        )
        .group_by(Article.media_source_id)
    )
    rows = (await db.execute(agg)).all()
    by_src: dict[str, tuple[int, int]] = {
        str(r[0]): (int(r[1] or 0), int(r[2] or 0)) for r in rows if r[0]
    }

    src_list = (
        await db.execute(select(MediaSource).where(MediaSource.is_active.is_(True)))
    ).scalars().all()

    now_iso = datetime.now(timezone.utc).isoformat()
    updated = 0
    for src in src_list:
        ok_n, err_n = by_src.get(src.id, (0, 0))
        prev = src.health_metrics_json if isinstance(src.health_metrics_json, dict) else {}
        merged = {
            **prev,
            "last_24h_translation_ok": ok_n,
            "last_24h_translation_errors": err_n,
            "last_24h_translation_metrics_at": now_iso,
        }
        if merged != prev:
            src.health_metrics_json = merged
            updated += 1

    logger.info(
        "source_health_metrics.translation_24h",
        sources_total=len(src_list),
        sources_with_activity=len(by_src),
        rows_updated=updated,
    )
    return updated
