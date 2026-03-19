"""
HDBSCAN clustering service for thematic grouping of articles.
"""

import uuid
from datetime import datetime, timedelta, timezone

import hdbscan
import numpy as np
import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.article import Article
from src.models.cluster import TopicCluster

logger = structlog.get_logger()


class ClusteringService:
    def __init__(self, min_cluster_size: int = 3, min_samples: int = 2) -> None:
        self.min_cluster_size = min_cluster_size
        self.min_samples = min_samples

    def cluster_embeddings(self, embeddings: list[list[float]]) -> list[int]:
        if len(embeddings) < self.min_cluster_size:
            return [-1] * len(embeddings)

        X = np.array(embeddings)
        norms = np.linalg.norm(X, axis=1, keepdims=True)
        norms[norms == 0] = 1
        X_norm = X / norms

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=self.min_cluster_size,
            min_samples=self.min_samples,
            metric="euclidean",
            cluster_selection_method="eom",
        )
        labels = clusterer.fit_predict(X_norm)
        return labels.tolist()

    async def run_clustering(self, db: AsyncSession) -> dict:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=72)

        stmt = (
            select(Article)
            .options(selectinload(Article.media_source))
            .where(Article.embedding.isnot(None))
            .where(Article.created_at >= cutoff)
        )
        result = await db.execute(stmt)
        articles = list(result.scalars().all())

        if len(articles) < self.min_cluster_size:
            return {"clusters_created": 0, "articles_clustered": 0, "noise_articles": len(articles)}

        embeddings = [list(a.embedding) if a.embedding is not None else [] for a in articles]
        valid_indices = [i for i, e in enumerate(embeddings) if len(e) == 1024]
        if len(valid_indices) < self.min_cluster_size:
            return {"clusters_created": 0, "articles_clustered": 0, "noise_articles": len(articles)}

        valid_embeddings = [embeddings[i] for i in valid_indices]
        labels = self.cluster_embeddings(valid_embeddings)

        await db.execute(
            update(Article).where(Article.cluster_id.isnot(None)).values(cluster_id=None)
        )
        await db.execute(update(TopicCluster).values(is_active=False))

        unique_labels = set(l for l in labels if l != -1)
        cluster_map: dict[int, TopicCluster] = {}

        for label in unique_labels:
            indices_in_cluster = [valid_indices[i] for i, l in enumerate(labels) if l == label]
            cluster_articles = [articles[i] for i in indices_in_cluster]
            countries = set()
            for a in cluster_articles:
                if a.media_source and a.media_source.country:
                    countries.add(a.media_source.country)

            cluster = TopicCluster(
                id=uuid.uuid4(),
                label=None,
                article_count=len(cluster_articles),
                country_count=len(countries),
                latest_article_at=max(
                    (a.published_at or a.created_at) for a in cluster_articles
                ),
                is_active=True,
            )
            db.add(cluster)
            cluster_map[label] = cluster

            for article in cluster_articles:
                article.cluster_id = cluster.id

        await db.commit()

        noise_count = labels.count(-1)
        logger.info(
            "clustering_complete",
            total_articles=len(articles),
            clusters_created=len(unique_labels),
            noise_articles=noise_count,
        )

        return {
            "clusters_created": len(unique_labels),
            "articles_clustered": len(articles) - noise_count,
            "noise_articles": noise_count,
        }
