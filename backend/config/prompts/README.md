# Prompts production MEMW (Partie G)

## Cartographie spec G1 ↔ fichiers

| Spec G1 (`translate_summarize_v2`, etc.) | Fichier YAML | Chargement code |
|--------------------------------------------|--------------|-----------------|
| Traduction + résumé dense + métadonnées (bundle principal) | [`translate_article_v2.yaml`](translate_article_v2.yaml) | `load_prompt_bundle("translate_article_v2")` dans [`translator.py`](../src/services/translator.py) |
| Variante documentée MEMW_PROMPT_SUITE (JSON schema explicite) | [`translate_summarize_v2.yaml`](translate_summarize_v2.yaml) | `id: prompt_translate_summarize_v2` — utilisable pour alignement doc ; **non** utilisé par le traducteur par défaut |
| Pertinence éditoriale (Haiku) | [`relevance_score_v2.yaml`](relevance_score_v2.yaml) | Service relevance / scheduler |
| Curateur | [`curator_v2.yaml`](curator_v2.yaml) | `curator_service` |
| Revue par sujet | [`generate_review_v2.yaml`](generate_review_v2.yaml) | `edition_review_generator` |
| Libellés clusters | [`cluster_label_v2.yaml`](cluster_label_v2.yaml) | Clustering |

**Règle** : le nom « `translate_summarize_v2` » dans la spec désigne le **rôle** (traduction + résumé). L’implémentation actuelle charge **`translate_article_v2`** pour ce rôle ; ne pas renommer le fichier sans mettre à jour `load_prompt_bundle(...)`.
