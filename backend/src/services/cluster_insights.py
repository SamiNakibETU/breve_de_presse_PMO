"""Métadonnées de veille par cluster (MVP « narrative » sans modèle causal)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.models.article import Article
from src.models.cluster import TopicCluster
from src.models.media_source import MediaSource
from src.services.alerts import post_cluster_hot_alert
from src.services.relevance import compute_editorial_relevance


async def enrich_cluster_insights(db: AsyncSession) -> int:
    """
    Pour chaque cluster actif : insight_metadata avec volumes, pays, score moyen.
    Sert de base d’alerte manuelle (« cluster X très chargé sur l’Iran »).
    """
    stmt = select(TopicCluster).where(TopicCluster.is_active.is_(True))
    res = await db.execute(stmt)
    clusters = res.scalars().all()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)
    updated = 0
    settings = get_settings()
    thr = settings.alert_cluster_article_threshold

    for cluster in clusters:
        q = (
            select(Article, MediaSource)
            .join(MediaSource, Article.media_source_id == MediaSource.id)
            .where(Article.cluster_id == cluster.id)
        )
        r = await db.execute(q)
        rows = r.all()
        total = len(rows)
        recent = 0
        scores: list[int] = []
        countries: set[str] = set()
        topic_hits: dict[str, int] = {}

        for art, src in rows:
            countries.add(src.country_code or "")
            rel = compute_editorial_relevance(
                country_code=src.country_code or "XX",
                article_type=art.article_type,
                published_at=art.published_at,
                source_language=art.source_language,
                tier=src.tier,
                has_summary=bool(art.summary_fr),
                has_quotes=bool(art.key_quotes_fr and len(art.key_quotes_fr) > 0),
            )
            scores.append(rel)
            if art.collected_at and art.collected_at >= cutoff:
                recent += 1
            tids = art.olj_topic_ids or []
            if isinstance(tids, list):
                for tid in tids:
                    if isinstance(tid, str):
                        topic_hits[tid] = topic_hits.get(tid, 0) + 1

        avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0
        top_topics = sorted(topic_hits.items(), key=lambda x: -x[1])[:5]

        old_meta = dict(cluster.insight_metadata or {})
        prev_total = old_meta.get("articles_total")
        prev_7 = old_meta.get("articles_last_7d")
        base = dict(old_meta)
        base.update(
            {
                "articles_total": total,
                "articles_last_7d": recent,
                "distinct_country_codes": sorted(c for c in countries if c),
                "avg_editorial_relevance": avg_score,
                "top_olj_topics": [{"id": k, "count": v} for k, v in top_topics],
                "computed_at": now.isoformat(),
            }
        )
        cluster.insight_metadata = base
        updated += 1

        if thr is not None and thr > 0:
            prev_t = int(prev_total) if prev_total is not None else 0
            prev_r = int(prev_7) if prev_7 is not None else 0
            hot = total >= thr or recent >= thr
            was_hot = prev_t >= thr or prev_r >= thr
            if hot and not was_hot:
                await post_cluster_hot_alert(
                    cluster_id=str(cluster.id),
                    label=cluster.label,
                    articles_total=total,
                    articles_last_7d=recent,
                )

    if updated:
        await db.commit()
    return updated
