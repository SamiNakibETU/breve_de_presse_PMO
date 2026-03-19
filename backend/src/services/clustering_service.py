"""
HDBSCAN clustering for thematic grouping of editorial articles.

- Périmètre : types opinion / éditorial / tribune / analyse + hors lifestyle (editorial_scope).
- Fenêtre courte (48 h par défaut) pour limiter les méga-blocs « tout le Moyen-Orient ».
- Sous-clustering récursif si un cluster dépasse cluster_refinement_max_size.
"""

import uuid
from datetime import datetime, timedelta, timezone

import hdbscan
import numpy as np
import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.config import get_settings
from src.models.article import Article
from src.models.cluster import TopicCluster
from src.services.editorial_scope import is_article_eligible_for_clustering

logger = structlog.get_logger()

REGIONAL_COUNTRIES: frozenset[str] = frozenset({
    "Liban", "Israël", "Iran", "EAU", "Émirats Arabes Unis",
    "Arabie Saoudite", "Turquie", "Irak", "Syrie", "Qatar",
    "Koweït", "Jordanie", "Égypte",
})

EDITORIAL_CLUSTER_TYPES: frozenset[str] = frozenset({
    "opinion", "editorial", "tribune", "analysis",
})


def _refine_mega_clusters(
    labels: list[int],
    X_norm: np.ndarray,
    max_size: int,
    depth: int = 0,
    max_depth: int = 2,
) -> list[int]:
    """Découpe les clusters trop gros avec un second HDBSCAN plus fin."""
    if depth >= max_depth:
        return labels

    labels = list(labels)
    positive = [lab for lab in set(labels) if lab != -1]
    if not positive:
        return labels

    changed = False

    for L in list(positive):
        idxs = [i for i, lab in enumerate(labels) if lab == L]
        if len(idxs) <= max_size:
            continue

        next_id = max((lab for lab in labels if lab >= 0), default=-1) + 1

        sub = X_norm[idxs]
        sub_clusterer = hdbscan.HDBSCAN(
            min_cluster_size=max(4, min(6, len(idxs) // 8)),
            min_samples=3,
            metric="euclidean",
            cluster_selection_method="leaf",
        )
        sub_lab = sub_clusterer.fit_predict(sub)
        unique_sub = {s for s in sub_lab if s != -1}
        if len(unique_sub) < 2:
            continue

        mapping: dict[int, int] = {}
        for s in sorted(unique_sub):
            mapping[s] = next_id
            next_id += 1

        for j, i in enumerate(idxs):
            sl = sub_lab[j]
            if sl == -1:
                labels[i] = -1
            else:
                labels[i] = mapping[sl]
        changed = True

    if changed:
        return _refine_mega_clusters(labels, X_norm, max_size, depth + 1, max_depth)
    return labels


class ClusteringService:
    def __init__(
        self,
        min_cluster_size: int | None = None,
        min_samples: int | None = None,
        cluster_method: str | None = None,
    ) -> None:
        s = get_settings()
        self.min_cluster_size = min_cluster_size or s.hdbscan_min_cluster_size
        self.min_samples = min_samples or s.hdbscan_min_samples
        self.cluster_method = cluster_method or s.hdbscan_cluster_method
        self._settings = s

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
            cluster_selection_method=self.cluster_method,
        )
        labels = clusterer.fit_predict(X_norm)

        max_size = self._settings.cluster_refinement_max_size
        labels = _refine_mega_clusters(
            labels.tolist(), X_norm, max_size=max_size
        )

        labels_arr = np.array(labels)
        unique = set(int(l) for l in labels_arr if l != -1)
        logger.info(
            "hdbscan.result",
            n_articles=len(embeddings),
            n_clusters=len(unique),
            noise=int(np.sum(labels_arr == -1)),
            params={
                "min_cluster_size": self.min_cluster_size,
                "min_samples": self.min_samples,
                "method": self.cluster_method,
                "refinement_max_size": max_size,
            },
        )
        return labels_arr.tolist()

    async def run_clustering(self, db: AsyncSession) -> dict:
        s = self._settings
        cutoff = datetime.now(timezone.utc) - timedelta(hours=s.clustering_window_hours)

        stmt = (
            select(Article)
            .options(selectinload(Article.media_source))
            .where(Article.embedding.isnot(None))
            .where(Article.created_at >= cutoff)
        )
        if s.cluster_only_editorial_types:
            stmt = stmt.where(Article.article_type.in_(tuple(EDITORIAL_CLUSTER_TYPES)))

        result = await db.execute(stmt)
        articles = list(result.scalars().all())

        articles = [
            a
            for a in articles
            if is_article_eligible_for_clustering(
                a.title_fr,
                a.title_original or "",
                a.summary_fr,
                a.article_type,
                EDITORIAL_CLUSTER_TYPES,
                enforce_editorial_types=s.cluster_only_editorial_types,
            )
        ]

        if len(articles) < self.min_cluster_size:
            return {
                "clusters_created": 0,
                "articles_clustered": 0,
                "noise_articles": len(articles),
            }

        embeddings = [list(a.embedding) if a.embedding is not None else [] for a in articles]
        valid_indices = [i for i, e in enumerate(embeddings) if len(e) == 1024]
        if len(valid_indices) < self.min_cluster_size:
            return {
                "clusters_created": 0,
                "articles_clustered": 0,
                "noise_articles": len(articles),
            }

        valid_embeddings = [embeddings[i] for i in valid_indices]
        labels = self.cluster_embeddings(valid_embeddings)

        await db.execute(
            update(Article).where(Article.cluster_id.isnot(None)).values(cluster_id=None)
        )
        await db.execute(update(TopicCluster).values(is_active=False))

        unique_labels = set(l for l in labels if l != -1)

        for label in unique_labels:
            indices_in_cluster = [valid_indices[i] for i, l in enumerate(labels) if l == label]
            cluster_articles = [articles[i] for i in indices_in_cluster]

            countries = set()
            for a in cluster_articles:
                if a.media_source and a.media_source.country:
                    countries.add(a.media_source.country)

            regional_countries = countries & REGIONAL_COUNTRIES

            confidences = [
                a.translation_confidence
                for a in cluster_articles
                if a.translation_confidence is not None
            ]
            avg_rel = round(sum(confidences) / len(confidences), 2) if confidences else 0.0

            cluster = TopicCluster(
                id=uuid.uuid4(),
                label=None,
                article_count=len(cluster_articles),
                country_count=len(regional_countries) if regional_countries else len(countries),
                avg_relevance=avg_rel,
                latest_article_at=max(
                    (a.published_at or a.created_at) for a in cluster_articles
                ),
                is_active=True,
            )
            db.add(cluster)

            for article in cluster_articles:
                article.cluster_id = cluster.id

        await db.commit()

        noise_count = labels.count(-1)
        logger.info(
            "clustering_complete",
            total_articles=len(articles),
            valid_articles=len(valid_indices),
            clusters_created=len(unique_labels),
            noise_articles=noise_count,
            window_hours=s.clustering_window_hours,
            editorial_only=s.cluster_only_editorial_types,
        )

        return {
            "clusters_created": len(unique_labels),
            "articles_clustered": len(valid_indices) - noise_count,
            "noise_articles": noise_count,
        }
