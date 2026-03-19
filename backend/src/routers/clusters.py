"""
Clusters API: list clusters, get cluster articles, refresh clustering.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.database import get_db
from src.models.article import Article
from src.models.cluster import TopicCluster
from src.models.media_source import MediaSource
from src.schemas.clusters import (
    ClusterListResponse,
    ClusterRefreshResponse,
    ClusterResponse,
)
from src.services.cluster_labeller import label_clusters
from src.services.clustering_service import ClusteringService
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

    cluster_responses = []
    for cluster in clusters:
        articles_stmt = (
            select(Article)
            .options(selectinload(Article.media_source))
            .where(Article.cluster_id == cluster.id)
        )
        articles_result = await db.execute(articles_stmt)
        articles = articles_result.scalars().all()
        countries = list(
            set(
                a.media_source.country
                for a in articles
                if a.media_source and a.media_source.country
            )
        )

        cluster_responses.append(
            ClusterResponse(
                id=cluster.id,
                label=cluster.label,
                article_count=cluster.article_count,
                country_count=cluster.country_count,
                avg_relevance=cluster.avg_relevance,
                latest_article_at=cluster.latest_article_at,
                is_active=cluster.is_active,
                countries=countries,
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
        by_country[country].append(
            {
                "id": str(article.id),
                "title_fr": article.title_fr,
                "title_original": article.title_original,
                "summary_fr": article.summary_fr,
                "source_name": article.media_source.name if article.media_source else None,
                "country": country,
                "published_at": article.published_at.isoformat() if article.published_at else None,
                "article_type": article.article_type,
                "author": article.author,
                "url": article.url,
                "source_language": article.source_language,
                "translation_confidence": article.translation_confidence,
            }
        )

    return {
        "cluster_id": cluster_id,
        "cluster_label": cluster.label if cluster else None,
        "articles_by_country": by_country,
        "total_articles": len(articles),
        "countries": list(by_country.keys()),
    }


@router.post("/refresh", response_model=ClusterRefreshResponse)
async def refresh_clusters(db: AsyncSession = Depends(get_db)):
    embedding_service = EmbeddingService()
    clustering_service = ClusteringService()

    embedded = await embedding_service.embed_pending_articles(db)
    clustering_result = await clustering_service.run_clustering(db)
    labeled = await label_clusters(db)

    return ClusterRefreshResponse(
        clusters_created=clustering_result["clusters_created"],
        articles_clustered=clustering_result["articles_clustered"],
        articles_embedded=embedded,
        clusters_labeled=labeled,
    )
