import numpy as np
import pytest

from src.services.clustering_service import ClusteringService


def test_cluster_embeddings_groups_similar():
    # UMAP désactivé : HDBSCAN sur embeddings normalisés (reproductible sur ce jeu)
    service = ClusteringService(min_cluster_size=3, min_samples=2, use_umap=False)
    np.random.seed(42)
    group1 = [list(np.random.randn(1024) + 10) for _ in range(5)]
    group2 = [list(np.random.randn(1024) - 10) for _ in range(5)]
    group3 = [list(np.random.randn(1024)) for _ in range(5)]
    embeddings = group1 + group2 + group3

    labels, soft = service.cluster_embeddings(embeddings)
    assert len(labels) == 15
    assert len(soft) == 15
    assert len(set(labels[:5])) == 1
    assert len(set(labels[5:10])) == 1


def test_cluster_embeddings_handles_noise():
    service = ClusteringService(use_umap=False)
    embeddings = [list(np.random.randn(1024)) for _ in range(2)]
    labels, soft = service.cluster_embeddings(embeddings)
    assert len(labels) == 2
    assert all(l == -1 for l in labels)
    assert soft == [False, False]
