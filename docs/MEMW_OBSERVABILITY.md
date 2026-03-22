# Observabilité MEMW (Partie H)

## Tables

- **`llm_call_logs`** — créées lors des appels curateur / génération revue ([`edition.py`](../backend/src/models/edition.py) `LLMCallLog`). Vérifier volumétrie et rétention en production.
- **`pipeline_trace_id`** sur `editions` — corrélation run pipeline ; renseigner côté orchestrateur si vide en recette.
- **`translation_quality_flags`** sur `articles` — drapeaux LLM post-traduction (liste JSON).

## Sécurité

- Mutations API : [`require_internal_key`](../backend/src/deps/auth.py) — header `Authorization: Bearer <INTERNAL_API_KEY>` si la variable d’environnement est définie.
- Routers concernés (non exhaustif) : `pipeline`, `articles`, `clusters`, `editions`, `reviews`, `olj_watch`.

## Alertes (H2)

- À brancher sur métriques applicatives (échecs collecte, taux `needs_review`, erreurs LLM) — hors périmètre code actuel ; prévoir export Prometheus / logs structurés.
