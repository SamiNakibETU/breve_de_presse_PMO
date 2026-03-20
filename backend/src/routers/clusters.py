"""
Clusters API: list clusters, get cluster articles, refresh clustering.
"""

from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.database import get_db
from src.deps.auth import require_internal_key
from src.limiter import limiter
from src.models.article import Article
from src.models.cluster import TopicCluster
from src.models.media_source import MediaSource
from src.schemas.clusters import (
    ClusterListResponse,
    ClusterRefreshResponse,
    ClusterResponse,
    ThesisPreviewItem,
)
from src.services.cluster_insights import enrich_cluster_insights
from src.services.cluster_labeller import label_clusters
from src.services.clustering_service import ClusteringService, REGIONAL_COUNTRIES
from src.services.embedding_service import EmbeddingService

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


@router.get("", response_model=ClusterListResponse)
async def list_clusters(db: AsyncSession = Depends(get_db)):
    try:
        stmt = (
            select(TopicCluster)
            .where(TopicCluster.is_active == True)
            .order_by(TopicCluster.avg_relevance.desc())
        )
        result = await db.execute(stmt)
        clusters = result.scalars().all()
    except Exception:
        return ClusterListResponse(clusters=[], total=0, noise_count=0)

    if not clusters:
        noise_count = 0
        try:
            noise_stmt = select(func.count(Article.id)).where(
                Article.embedding.isnot(None),
                Article.cluster_id.is_(None),
            )
            noise_result = await db.execute(noise_stmt)
            noise_count = noise_result.scalar() or 0
        except Exception:
            pass
        return ClusterListResponse(clusters=[], total=0, noise_count=noise_count)

    cluster_ids = [c.id for c in clusters]

    thesis_stmt = (
        select(
            Article.cluster_id,
            Article.thesis_summary_fr,
            Article.published_at,
            Article.collected_at,
            MediaSource.name,
            Article.article_type,
        )
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(Article.cluster_id.in_(cluster_ids))
        .where(Article.thesis_summary_fr.isnot(None))
        .order_by(
            Article.published_at.desc().nullslast(),
            Article.collected_at.desc(),
        )
    )
    thesis_rows = (await db.execute(thesis_stmt)).all()
    theses_by_cluster: dict[UUID, list[ThesisPreviewItem]] = defaultdict(list)
    thesis_dedup: dict[UUID, set[str]] = defaultdict(set)
    for cid, thesis, _pub, _col, media_name, article_type in thesis_rows:
        if cid is None or not thesis or not str(thesis).strip():
            continue
        cur = theses_by_cluster[cid]
        if len(cur) >= 3:
            continue
        t = str(thesis).strip()[:220]
        key = f"{t}|{media_name or ''}|{article_type or ''}"
        if key in thesis_dedup[cid]:
            continue
        thesis_dedup[cid].add(key)
        cur.append(
            ThesisPreviewItem(
                thesis=t,
                media_name=(str(media_name).strip() if media_name else None) or None,
                article_type=(str(article_type).strip() if article_type else None)
                or None,
            )
        )

    # Une seule requête : (cluster_id, country) distincts — évite N+1 chargement d'articles
    countries_stmt = (
        select(Article.cluster_id, MediaSource.country)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(Article.cluster_id.in_(cluster_ids))
        .where(MediaSource.country.isnot(None))
        .distinct()
    )
    countries_result = await db.execute(countries_stmt)
    by_cluster_all: dict[UUID, set[str]] = defaultdict(set)
    for cid, country in countries_result.all():
        if cid is not None and country:
            by_cluster_all[cid].add(country)

    cluster_responses = []
    for cluster in clusters:
        all_countries = by_cluster_all.get(cluster.id, set())
        regional_sorted = sorted(all_countries & REGIONAL_COUNTRIES)
        country_count = (
            len(regional_sorted) if regional_sorted else len(all_countries)
        )

        meta = cluster.insight_metadata or {}
        is_emerging = bool(meta.get("is_emerging"))

        cluster_responses.append(
            ClusterResponse(
                id=cluster.id,
                label=cluster.label,
                article_count=cluster.article_count,
                country_count=country_count,
                avg_relevance=cluster.avg_relevance,
                latest_article_at=cluster.latest_article_at,
                is_active=cluster.is_active,
                countries=regional_sorted,
                is_emerging=is_emerging,
                thesis_previews=theses_by_cluster.get(cluster.id, []),
            )
        )

    noise_count = 0
    try:
        noise_stmt = select(func.count(Article.id)).where(
            Article.embedding.isnot(None),
            Article.cluster_id.is_(None),
        )
        noise_result = await db.execute(noise_stmt)
        noise_count = noise_result.scalar() or 0
    except Exception:
        pass

    return ClusterListResponse(
        clusters=cluster_responses,
        total=len(cluster_responses),
        noise_count=noise_count,
    )


@router.get("/{cluster_id}/articles")
async def get_cluster_articles(
    cluster_id: str,
    db: AsyncSession = Depends(get_db),
):
    cluster_stmt = select(TopicCluster).where(TopicCluster.id == cluster_id)
    cluster_result = await db.execute(cluster_stmt)
    cluster = cluster_result.scalar_one_or_none()

    stmt = (
        select(Article)
        .options(selectinload(Article.media_source))
        .where(Article.cluster_id == cluster_id)
        .order_by(Article.published_at.desc().nullslast())
    )
    result = await db.execute(stmt)
    articles = result.scalars().all()

    by_country: dict[str, list] = {}
    for article in articles:
        country = (
            article.media_source.country
            if article.media_source
            else "Inconnu"
        )
        if country not in by_country:
            by_country[country] = []
        framing = article.framing_json if isinstance(article.framing_json, dict) else None
        framing_line = None
        if framing:
            framing_line = framing.get("one_line_fr") or framing.get("prescription")

        by_country[country].append(
            {
                "id": str(article.id),
                "title_fr": article.title_fr,
                "title_original": article.title_original,
                "thesis_summary_fr": article.thesis_summary_fr,
                "summary_fr": article.summary_fr,
                "source_name": article.media_source.name if article.media_source else None,
                "country": country,
                "published_at": article.published_at.isoformat() if article.published_at else None,
                "article_type": article.article_type,
                "author": article.author,
                "url": article.url,
                "source_language": article.source_language,
                "translation_confidence": article.translation_confidence,
                "framing_line": framing_line,
                "cluster_soft_assigned": bool(
                    getattr(article, "cluster_soft_assigned", False)
                ),
            }
        )

    regional = [c for c in by_country.keys() if c in REGIONAL_COUNTRIES]
    other = [c for c in by_country.keys() if c not in REGIONAL_COUNTRIES]

    return {
        "cluster_id": cluster_id,
        "cluster_label": cluster.label if cluster else None,
        "articles_by_country": by_country,
        "total_articles": len(articles),
        "countries": sorted(regional),
        "international_sources": sorted(other),
    }


@router.post("/refresh", response_model=ClusterRefreshResponse)
@limiter.limit("6/minute")
async def refresh_clusters(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    embedding_service = EmbeddingService()
    clustering_service = ClusteringService()

    embedded = await embedding_service.embed_pending_articles(db)
    clustering_result = await clustering_service.run_clustering(db)
    labeled = await label_clusters(db)
    insights = await enrich_cluster_insights(db)

    return ClusterRefreshResponse(
        clusters_created=clustering_result["clusters_created"],
        articles_clustered=clustering_result["articles_clustered"],
        articles_embedded=embedded,
        clusters_labeled=labeled,
        insights_updated=insights,
    )
