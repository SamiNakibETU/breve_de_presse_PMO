"""Construction du payload GET /api/media-sources/health (réutilisable par scripts CLI)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.media_tier_labels import tier_band
from src.models.article import Article
from src.models.collection_log import CollectionLog
from src.models.media_source import MediaSource
from src.services.media_source_aliases import equivalent_media_source_ids
from src.services.source_health_metrics import (
    fetch_translation_24h_counts_by_source,
    sum_translation_24h_for_aliases,
)


async def build_media_sources_health_payload(db: AsyncSession) -> dict:
    """Même structure que la route FastAPI `media_sources_health`."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=72)
    translated_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    translated_statuses = (
        "translated",
        "needs_review",
        "low_quality",
        "formatted",
    )
    result = await db.execute(
        select(MediaSource).where(MediaSource.is_active.is_(True)).order_by(MediaSource.name)
    )
    sources = result.scalars().all()
    tr_by_src = await fetch_translation_24h_counts_by_source(db, translated_cutoff)
    out: list[dict] = []
    for s in sources:
        agg_ids = equivalent_media_source_ids(s.id)
        id_filter = (
            Article.media_source_id == agg_ids[0]
            if len(agg_ids) == 1
            else Article.media_source_id.in_(agg_ids)
        )
        cnt = (
            await db.execute(
                select(func.count(Article.id)).where(
                    id_filter,
                    Article.collected_at >= cutoff,
                )
            )
        ).scalar() or 0
        last_24h_translated = (
            await db.execute(
                select(func.count(Article.id)).where(
                    id_filter,
                    Article.processed_at.isnot(None),
                    Article.processed_at >= translated_cutoff,
                    Article.status.in_(translated_statuses),
                )
            )
        ).scalar() or 0
        log_filter = (
            CollectionLog.media_source_id == agg_ids[0]
            if len(agg_ids) == 1
            else CollectionLog.media_source_id.in_(agg_ids)
        )
        last_log = (
            (
                await db.execute(
                    select(CollectionLog)
                    .where(
                        log_filter,
                        CollectionLog.completed_at.isnot(None),
                    )
                    .order_by(CollectionLog.completed_at.desc())
                    .limit(1)
                )
            )
            .scalars()
            .first()
        )
        persisted = getattr(s, "health_status", None)
        empty_runs_ui = int(getattr(s, "consecutive_empty_collection_runs", 0) or 0)
        if persisted in ("ok", "degraded", "dead"):
            health = persisted
            if cnt > 0 and empty_runs_ui == 0 and health in ("degraded", "dead"):
                health = "ok"
        else:
            stale = s.last_collected_at is None or s.last_collected_at < cutoff
            if cnt == 0 and stale:
                health = "dead"
            elif cnt == 0:
                health = "degraded"
            else:
                health = "ok"
        hm = (
            s.health_metrics_json
            if isinstance(getattr(s, "health_metrics_json", None), dict)
            else {}
        )
        ok_tr, err_tr = sum_translation_24h_for_aliases(tr_by_src, s.id)
        tb = tier_band(int(s.tier) if s.tier is not None else None)
        out.append(
            {
                "id": s.id,
                "name": s.name,
                "country_code": s.country_code,
                "tier": int(s.tier) if s.tier is not None else 1,
                "tier_band": tb,
                "articles_72h": cnt,
                "last_collected_at": (
                    s.last_collected_at.isoformat() if s.last_collected_at else None
                ),
                "health_status": health,
                "consecutive_empty_collection_runs": int(
                    getattr(s, "consecutive_empty_collection_runs", 0) or 0
                ),
                "last_article_ingested_at": (
                    s.last_article_ingested_at.isoformat()
                    if getattr(s, "last_article_ingested_at", None)
                    else None
                ),
                "last_24h_translated_count": last_24h_translated,
                "translation_24h_ok_persisted": ok_tr,
                "translation_24h_errors_persisted": err_tr,
                "translation_24h_metrics_at": hm.get(
                    "last_24h_translation_metrics_at"
                ),
                "health_metrics": hm if hm else None,
                "last_collection": (
                    {
                        "completed_at": last_log.completed_at.isoformat()
                        if last_log.completed_at
                        else None,
                        "duration_seconds": last_log.duration_seconds,
                        "articles_new": last_log.articles_new,
                        "articles_filtered": last_log.articles_filtered,
                        "articles_found": last_log.articles_found,
                        "extraction_attempts": getattr(
                            last_log, "extraction_attempts", 0
                        ),
                        "extraction_primary_success": getattr(
                            last_log, "extraction_primary_success", 0
                        ),
                    }
                    if last_log
                    else None
                ),
            }
        )
        if len(agg_ids) > 1:
            out[-1]["alias_aggregate_ids"] = agg_ids
    p0_dead = [
        r
        for r in out
        if r.get("tier_band") == "P0" and r.get("health_status") == "dead"
    ]
    return {
        "sources": out,
        "window_hours": 72,
        "critical_p0_sources_down": len(p0_dead),
        "translation_metrics_note_fr": (
            "Pour certains médias, plusieurs fiches (IDs différents) existent en base : "
            "les compteurs ci-dessous agrègent toutes ces fiches pour refléter l’activité réelle."
        ),
    }
