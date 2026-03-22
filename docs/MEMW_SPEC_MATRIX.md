# Matrice spec / audit → implémentation (relecture mars 2026)

Document vivant : critères issus de [MEMW_SPEC_FINALE_v3.md](../MEMW_SPEC_FINALE_v3.md) A3 et [AUDIT_FINALISATION_MEMW_v2.md](../AUDIT_FINALISATION_MEMW_v2.md) §2.1, revérifiés dans le dépôt.

| Critère | Statut | Preuve (fichiers / comportement) |
|--------|--------|-----------------------------------|
| Modèle Édition (fenêtre, lifecycle) | Partiel | [`backend/src/models/edition.py`](../backend/src/models/edition.py), [`routers/editions.py`](../backend/src/routers/editions.py) — compléter recette cron / fenêtre |
| EditionTopic (sujets curatés) | Partiel | Même module — recette génération + UI |
| Dédup MinHash (passe 1) | OK | [`backend/src/services/dedup_surface.py`](../backend/src/services/dedup_surface.py) |
| Dédup cosinus / sémantique | Partiel | `semantic_dedupe` — vérifier non-régression numpy + élection représentant |
| Clustering restreint à l’édition | Partiel | Filtres relevance + édition — vérifier `clustering_service` vs corpus global |
| UMAP pré-HDBSCAN | OK | [`clustering_service.py`](../backend/src/services/clustering_service.py) (`_umap_reduce`), `clustering_use_umap` dans [`config.py`](../backend/src/config.py) ; variables `CLUSTERING_USE_UMAP`, `UMAP_N_COMPONENTS` (voir [`backend/.env.example`](../backend/.env.example)) |
| Curateur LLM | OK | [`backend/src/services/curator_service.py`](../backend/src/services/curator_service.py) |
| Génération par sujet (transitions) | Partiel | [`edition_review_generator.py`](../backend/src/services/edition_review_generator.py) |
| UX Sommaire → Sujet → Composition | Partiel | [`frontend/src/app/edition/`](../frontend/src/app/edition/) — comparer wireframes D6 |
| Régie vs composition | OK | `/edition/*` journaliste ; `/regie/*` + [`GET /api/regie/*`](../backend/src/routers/regie.py) (logs pipeline / LLM, signalement dédup) |
| Tiers P0/P1/P2 | OK | [`MEDIA_TIER_OVERRIDES.json`](../backend/data/MEDIA_TIER_OVERRIDES.json), import CSV, [`media_tier_labels.py`](../backend/src/media_tier_labels.py) |
| Prompts v2 + quality_flags | OK | `translate_article_v2.yaml`, colonne `translation_quality_flags` |
| Score pertinence ≠ confiance traduction | OK | `relevance_score_v2`, `relevance_band`, relevance dans pipeline |
| `pipeline_trace_id` | Partiel | Champ `Edition` — exposer dans debug / logs si besoin recette |
| Health sources | Partiel | `source_health` — audit : alias ; à surveiller |
| Auth mutations | OK | `require_internal_key` (Bearer) sur routers listés dans [`auth.py`](../backend/src/deps/auth.py) |
| Feedback faux positifs dédup | OK (P3) | Table `dedup_feedback`, [`POST/GET /api/regie/dedup-feedback`](../backend/src/routers/regie.py), UI [`regie/dedup`](../frontend/src/app/regie/dedup/page.tsx) |

## UX — routes vs wireframes D6

| Écran spec | Route Next.js | Notes |
|------------|---------------|--------|
| Sommaire édition | [`/edition/[date]`](../frontend/src/app/edition/[date]/page.tsx) | Sommaire par date |
| Détail sujet | [`/edition/[date]/topic/[id]`](../frontend/src/app/edition/[date]/topic/[id]/page.tsx) | Sujet / pays |
| Composition / export | [`/edition/[date]/compose`](../frontend/src/app/edition/[date]/compose/page.tsx) | Composition |
| Régie (pipeline, clustering) | `/regie/*` | Vocabulaire technique acceptable côté régie uniquement |

Accessibilité (D8) : erreurs principales en `role="alert"` / `aria-live="polite"` sur sommaire et sujet édition ; focus clavier à poursuivre sur les CTA.
