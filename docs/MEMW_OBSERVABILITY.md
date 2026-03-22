# Observabilité MEMW (Partie H)

## Tables

- **`pipeline_debug_logs`** — rapports par étape (dédup, etc.). Lecture via [`GET /api/regie/pipeline-debug-logs`](../backend/src/routers/regie.py).
- **`llm_call_logs`** — appels curateur / génération revue ([`edition.py`](../backend/src/models/edition.py) `LLMCallLog`). Lecture via [`GET /api/regie/llm-call-logs`](../backend/src/routers/regie.py).
- **`pipeline_trace_id`** sur `editions` — corrélation run pipeline ; renseigner côté orchestrateur si vide en recette.
- **`translation_quality_flags`** sur `articles` — drapeaux LLM post-traduction (liste JSON).
- **`dedup_feedback`** — signalements faux positifs dédup ([`dedup_feedback.py`](../backend/src/models/dedup_feedback.py)).

## API Régie

Endpoints sous **`/api/regie/*`** : même politique Bearer que les mutations si `INTERNAL_API_KEY` est défini — voir [`regie.py`](../backend/src/routers/regie.py) (pipeline-debug-logs, llm-call-logs, dedup-feedback).

## Sécurité

- Mutations et **lecture régie** : [`require_internal_key`](../backend/src/deps/auth.py) — header `Authorization: Bearer <INTERNAL_API_KEY>` si la variable d'environnement est définie.
- Routers concernés (non exhaustif) : `pipeline`, `articles`, `clusters`, `editions`, `reviews`, `olj_watch`, **`regie`**.

## Alertes (H2)

- À brancher sur métriques applicatives (échecs collecte, taux `needs_review`, erreurs LLM) — hors périmètre code actuel ; prévoir export Prometheus / logs structurés.
