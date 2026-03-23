#!/usr/bin/env python3
"""Affiche les réglages MEMW critiques avant un run (Railway / staging).

Usage (depuis le dossier backend)::

    python scripts/verify_memw_run_config.py
"""

from __future__ import annotations

import os
import sys

_backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

from src.config import get_settings  # noqa: E402


def main() -> None:
    s = get_settings()
    print("MEMW run config (backend)")
    print("  clustering_use_umap:", s.clustering_use_umap)
    print("  cluster_merge_centroid_cosine:", s.cluster_merge_centroid_cosine)
    print("  hdbscan_min_cluster_size:", s.hdbscan_min_cluster_size)
    print("  hdbscan_min_samples:", s.hdbscan_min_samples)
    print("  cluster_refinement_max_size:", s.cluster_refinement_max_size)
    print("  cohere_api_key set:", bool((s.cohere_api_key or "").strip()))
    print("  log_json:", s.log_json)
    print("  log_level:", s.log_level)
    print()
    print("Après un run clustering (Railway logs), vérifier :")
    print('  - événement "hdbscan.result" (n_clusters, noise, use_umap)')
    print('  - absence de "clustering.umap_failed_fallback" (sauf erreur UMAP)')


if __name__ == "__main__":
    main()
