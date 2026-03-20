"""
HDBSCAN clustering for thematic grouping of editorial articles.

- Embeddings → (optionnel) UMAP 5D → HDBSCAN + raffinement mega-clusters.
- Assignation souple : articles bruit rattachés au cluster le plus proche (cosinus).
- Fenêtre courte (48 h par défaut).
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
    "Koweït", "Jordanie", "Égypte", "Oman", "Bahreïn", "Algérie",
    "régional",
})

EDITORIAL_CLUSTER_TYPES: frozenset[str] = frozenset({
    "opinion", "editorial", "tribune", "analysis",
})

def _refine_mega_clusters(
    labels: list[int],
    X_space: np.ndarray,
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

        sub = X_space[idxs]
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
        return _refine_mega_clusters(labels, X_space, max_size, depth + 1, max_depth)
    return labels


def _centroid_normalized(X_norm: np.ndarray, indices: list[int]) -> np.ndarray:
    sub = X_norm[indices].mean(axis=0)
    n = float(np.linalg.norm(sub))
    if n < 1e-9:
        return sub
    return sub / n


def _soft_assign_noise(
    labels: list[int],
    X_norm: np.ndarray,
    min_cosine: float,
) -> tuple[list[int], list[bool]]:
    """Rattache les points encore à -1 au cluster dont le centroïde est le plus proche (cosinus)."""
    out = list(labels)
    soft = [False] * len(out)
    positive = sorted({lab for lab in out if lab != -1})
    if not positive:
        return out, soft

    centroids: dict[int, np.ndarray] = {}
    for L in positive:
        idxs = [i for i, lab in enumerate(out) if lab == L]
        if len(idxs) < 1:
            continue
        centroids[L] = _centroid_normalized(X_norm, idxs)

    for i, lab in enumerate(out):
        if lab != -1:
            continue
        v = X_norm[i]
        best_l = -1
        best_sim = -2.0
        for L, c in centroids.items():
            sim = float(np.dot(v, c))
            if sim > best_sim:
                best_sim = sim
                best_l = L
        if best_l >= 0 and best_sim >= min_cosine:
            out[i] = best_l
            soft[i] = True

    return out, soft


def _umap_reduce(X_norm: np.ndarray, s) -> np.ndarray:
    import umap

    n = len(X_norm)
    n_neighbors = min(s.umap_n_neighbors, max(2, n - 1))
    n_comp = min(s.umap_n_components, max(2, n - 2))
    reducer = umap.UMAP(
        n_neighbors=n_neighbors,
        n_components=n_comp,
        min_dist=float(s.umap_min_dist),
        metric="cosine",
        random_state=42,
        verbose=False,
    )
    return reducer.fit_transform(X_norm.astype(np.float32))


class ClusteringService:
    def __init__(
        self,
        min_cluster_size: int | None = None,
        min_samples: int | None = None,
        cluster_method: str | None = None,
        use_umap: bool | None = None,
    ) -> None:
        s = get_settings()
        self.min_cluster_size = min_cluster_size or s.hdbscan_min_cluster_size
        self.min_samples = min_samples or s.hdbscan_min_samples
        self.cluster_method = cluster_method or s.hdbscan_cluster_method
        self.use_umap = use_umap if use_umap is not None else s.clustering_use_umap
        self._settings = s

    def cluster_embeddings(
        self, embeddings: list[list[float]]
    ) -> tuple[list[int], list[bool]]:
        if len(embeddings) < self.min_cluster_size:
            return [-1] * len(embeddings), [False] * len(embeddings)

        X = np.array(embeddings, dtype=np.float64)
        norms = np.linalg.norm(X, axis=1, keepdims=True)
        norms[norms == 0] = 1
        X_norm = X / norms

        if self.use_umap and len(X_norm) >= max(self.min_cluster_size, 5):
            try:
                X_space = _umap_reduce(X_norm, self._settings)
            except Exception as exc:
                logger.warning(
                    "clustering.umap_failed_fallback",
                    error=str(exc)[:200],
                    n=len(X_norm),
                )
                X_space = X_norm
        else:
            X_space = X_norm

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=self.min_cluster_size,
            min_samples=self.min_samples,
            metric="euclidean",
            cluster_selection_method=self.cluster_method,
        )
        labels = clusterer.fit_predict(X_space)

        max_size = self._settings.cluster_refinement_max_size
        labels_list = _refine_mega_clusters(
            labels.tolist(), X_space, max_size=max_size
        )

        soft_thr = (
            self._settings.memw_compat_soft_cosine
            if self._settings.memw_compat_soft_cosine is not None
            else self._settings.clustering_soft_assign_min_cosine
        )
        labels_list, soft_flags = _soft_assign_noise(
            labels_list,
            X_norm,
            soft_thr,
        )

        labels_arr = np.array(labels_list)
        unique = {int(l) for l in labels_arr if l != -1}
        logger.info(
            "hdbscan.result",
            n_articles=len(embeddings),
            n_clusters=len(unique),
            noise=int(np.sum(labels_arr == -1)),
            soft_assigned=int(sum(soft_flags)),
            use_umap=self.use_umap and X_space.shape[1] != X_norm.shape[1],
            params={
                "min_cluster_size": self.min_cluster_size,
                "min_samples": self.min_samples,
                "method": self.cluster_method,
                "refinement_max_size": max_size,
            },
        )
        return labels_list, soft_flags

    async def _previous_cluster_centroids(
        self, db: AsyncSession
    ) -> list[np.ndarray]:
        stmt = select(TopicCluster.id).where(TopicCluster.is_active.is_(True))
        res = await db.execute(stmt)
        active_ids = [row[0] for row in res.all()]
        if not active_ids:
            return []

        prev: list[np.ndarray] = []
        for cid in active_ids:
            q = select(Article.embedding).where(
                Article.cluster_id == cid,
                Article.embedding.isnot(None),
            )
            r = await db.execute(q)
            vecs: list[list[float]] = []
            for (emb,) in r.all():
                if emb is not None and len(emb) == 1024:
                    vecs.append(list(emb))
            if len(vecs) < 2:
                continue
            M = np.array(vecs, dtype=np.float64)
            M = M / np.linalg.norm(M, axis=1, keepdims=True).clip(min=1e-9)
            c = M.mean(axis=0)
            n = float(np.linalg.norm(c))
            if n > 1e-9:
                c = c / n
            prev.append(c)
        return prev

    def _is_emerging_cluster(
        self,
        member_norms: np.ndarray,
        prev_centroids: list[np.ndarray],
        distinct_country_codes: int,
    ) -> bool:
        s = self._settings
        min_cc = int(s.emergence_min_distinct_countries)
        max_cos = float(s.emergence_max_cosine_previous)
        if distinct_country_codes < min_cc:
            return False
        c_new = member_norms.mean(axis=0)
        n = float(np.linalg.norm(c_new))
        if n < 1e-9:
            return False
        c_new = c_new / n
        if not prev_centroids:
            return True
        best = max(float(np.dot(c_new, p)) for p in prev_centroids)
        return best < max_cos

    async def run_clustering(self, db: AsyncSession) -> dict:
        s = self._settings
        cutoff = datetime.now(timezone.utc) - timedelta(hours=s.clustering_window_hours)

        prev_centroids = await self._previous_cluster_centroids(db)

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
        labels, soft_flags = self.cluster_embeddings(valid_embeddings)

        await db.execute(
            update(Article)
            .where(Article.cluster_id.isnot(None))
            .values(cluster_id=None, cluster_soft_assigned=False)
        )
        await db.execute(update(TopicCluster).values(is_active=False))

        unique_labels = {l for l in labels if l != -1}

        for label in unique_labels:
            pos_in_valid = [j for j, l in enumerate(labels) if l == label]
            indices_in_cluster = [valid_indices[j] for j in pos_in_valid]
            cluster_articles = [articles[i] for i in indices_in_cluster]

            emb_mat = np.array(
                [embeddings[i] for i in indices_in_cluster],
                dtype=np.float64,
            )
            emb_mat = emb_mat / np.linalg.norm(emb_mat, axis=1, keepdims=True).clip(
                min=1e-9
            )
            centroid_list = emb_mat.mean(axis=0).tolist()

            countries = set()
            country_codes: set[str] = set()
            for a in cluster_articles:
                if a.media_source and a.media_source.country:
                    countries.add(a.media_source.country)
                if a.media_source and a.media_source.country_code:
                    country_codes.add(a.media_source.country_code)

            regional_countries = countries & REGIONAL_COUNTRIES

            confidences = [
                a.translation_confidence
                for a in cluster_articles
                if a.translation_confidence is not None
            ]
            avg_rel = round(sum(confidences) / len(confidences), 2) if confidences else 0.0

            is_emerging = self._is_emerging_cluster(
                emb_mat,
                prev_centroids,
                len(country_codes),
            )

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
                insight_metadata={
                    "is_emerging": is_emerging,
                    "embedding_centroid": centroid_list,
                    "distinct_country_codes": sorted(country_codes),
                },
            )
            db.add(cluster)

            for j in pos_in_valid:
                art = articles[valid_indices[j]]
                art.cluster_id = cluster.id
                art.cluster_soft_assigned = soft_flags[j]

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
