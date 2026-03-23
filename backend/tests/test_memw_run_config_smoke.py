"""Smoke : réglages critiques pour un run MEMW (clustering + colonne status)."""

from src.config import Settings
from src.models.article import Article


def test_cluster_merge_default_not_overly_aggressive():
    s = Settings()
    assert s.cluster_merge_centroid_cosine >= 0.85
    assert s.cluster_merge_centroid_cosine <= 0.99


def test_cluster_merge_default_value_memw_run():
    s = Settings()
    assert s.cluster_merge_centroid_cosine == 0.88


def test_clustering_umap_default_enabled():
    s = Settings()
    assert s.clustering_use_umap is True


def test_article_status_column_fits_longest_status():
    # le plus long statut métier connu (était > VARCHAR(20) en prod)
    assert len("translation_abandoned") == 21
    col = Article.__table__.c.status
    assert col.type.length == 64  # type: ignore[attr-defined]
