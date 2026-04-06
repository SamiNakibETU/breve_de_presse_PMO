"""Construction du payload GET /api/media-sources/health (réutilisable par scripts CLI)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.media_tier_labels import tier_band
from src.models.article import Article
from src.models.collection_log import CollectionLog
from src.models.media_source import MediaSource
from src.services.media_source_aliases import equivalent_media_source_ids
from src.services.media_revue_registry import get_media_revue_registry_ids
from src.services.source_health_metrics import (
    fetch_translation_24h_counts_by_source,
    sum_translation_24h_for_aliases,
)


async def _fetch_article_counts_72h_by_source_id(
    db: AsyncSession, cutoff: datetime
) -> dict[str, int]:
    """Un seul GROUP BY : comptage articles collectés sur 72 h par `media_source_id`."""
    stmt = (
        select(Article.media_source_id, func.count(Article.id))
        .where(
            Article.collected_at >= cutoff,
            Article.media_source_id.isnot(None),
        )
        .group_by(Article.media_source_id)
    )
    rows = (await db.execute(stmt)).all()
    return {str(r[0]): int(r[1] or 0) for r in rows if r[0]}


async def _fetch_latest_collection_logs_by_source_id(
    db: AsyncSession,
) -> dict[str, CollectionLog]:
    """
    Dernier `CollectionLog` terminé par `media_source_id` (2 requêtes : max + jointure).
    """
    subq = (
        select(
            CollectionLog.media_source_id.label("mid"),
            func.max(CollectionLog.completed_at).label("max_c"),
        )
        .where(
            CollectionLog.completed_at.isnot(None),
            CollectionLog.media_source_id.isnot(None),
        )
        .group_by(CollectionLog.media_source_id)
    ).subquery()

    stmt = select(CollectionLog).join(
        subq,
        (CollectionLog.media_source_id == subq.c.mid)
        & (CollectionLog.completed_at == subq.c.max_c),
    )
    logs = (await db.execute(stmt)).scalars().all()
    out: dict[str, CollectionLog] = {}
    for log in logs:
        mid = log.media_source_id
        if mid and mid not in out:
            out[mid] = log
    return out


def _sum_counts_for_alias_ids(
    by_raw_id: dict[str, int], agg_ids: list[str]
) -> int:
    return sum(by_raw_id.get(i, 0) for i in agg_ids)


def _pick_latest_log_among_ids(
    last_by_mid: dict[str, CollectionLog], agg_ids: list[str]
) -> CollectionLog | None:
    candidates = [last_by_mid[i] for i in agg_ids if i in last_by_mid]
    if not candidates:
        return None
    return max(candidates, key=lambda x: x.completed_at or datetime.min.replace(tzinfo=timezone.utc))


async def build_media_sources_health_payload(
    db: AsyncSession,
    *,
    revue_registry_only: bool = False,
) -> dict:
    """Même structure que la route FastAPI `media_sources_health`."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=72)
    translated_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await db.execute(
        select(MediaSource).where(MediaSource.is_active.is_(True)).order_by(MediaSource.name)
    )
    sources = result.scalars().all()
    revue_ids: frozenset[str] | None = None
    if revue_registry_only:
        revue_ids = get_media_revue_registry_ids()
        sources = [s for s in sources if s.id in revue_ids]
    counts_72h_raw, tr_by_src, last_logs_by_mid = await asyncio.gather(
        _fetch_article_counts_72h_by_source_id(db, cutoff),
        fetch_translation_24h_counts_by_source(db, translated_cutoff),
        _fetch_latest_collection_logs_by_source_id(db),
    )
    out: list[dict] = []
    for s in sources:
        agg_ids = equivalent_media_source_ids(s.id)
        cnt = _sum_counts_for_alias_ids(counts_72h_raw, agg_ids)
        ok_tr, err_tr = sum_translation_24h_for_aliases(tr_by_src, s.id)
        # Aligné sur `fetch_translation_24h_counts_by_source` / statuts traduits OK (pas une requête par source).
        last_24h_translated = ok_tr
        last_log = _pick_latest_log_among_ids(last_logs_by_mid, agg_ids)
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
    payload: dict = {
        "sources": out,
        "window_hours": 72,
        "critical_p0_sources_down": len(p0_dead),
        "translation_metrics_note_fr": (
            "Pour certains médias, plusieurs fiches (IDs différents) existent en base : "
            "les compteurs ci-dessous agrègent toutes ces fiches pour refléter l’activité réelle."
        ),
    }
    if revue_registry_only and revue_ids is not None:
        payload["revue_registry_only"] = True
        payload["revue_registry_count"] = len(revue_ids)
    return payload
