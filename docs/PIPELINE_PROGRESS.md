# Progression des actions pipeline (tâche + polling)

## Principe

Les endpoints synchrones `POST /api/collect`, `/api/translate`, `/api/pipeline` et `POST /api/clusters/refresh` restent disponibles pour scripts et compatibilité.

Pour l’UI avec **étapes en direct**, utiliser :

### `POST /api/pipeline/tasks`

Corps JSON (Pydantic) :

```json
{
  "kind": "collect | translate | refresh_clusters | full_pipeline",
  "translate_limit": 300
}
```

- `translate_limit` : uniquement pour `translate` (défaut 300, max 1000).

Réponse : `{ "task_id": "<uuid>" }`.

### `GET /api/pipeline/tasks/{task_id}`

Jusqu’à `status` = `done` ou `error`, champs utiles :

- `step_key`, `step_label` — étape courante (mise à jour côté serveur).
- `result` — objet final (même forme que l’endpoint synchrone équivalent).
- `error` — message si `status === "error"`.

Le front interroge environ **toutes les 900 ms**.

## Implémentation serveur

| Fichier | Rôle |
|---------|------|
| `schemas/pipeline.py` | `PipelineTaskKind`, `PipelineTaskStartRequest` |
| `services/pipeline_task_store.py` | Table SQL `pipeline_jobs` (FIFO max ~80, multi-instances) |
| `models/pipeline_job.py` | Modèle SQLAlchemy des tâches async |
| `services/pipeline_async_jobs.py` | Exécution + `on_progress` |
| `services/collector.py` | `run_collection(on_progress=…)` |
| `services/translator.py` | `run_translation_pipeline(on_progress=…)` |
| `services/scheduler.py` | `daily_pipeline(on_progress=…)` |
| `routers/pipeline.py` | `POST /pipeline/tasks`, `GET /pipeline/tasks/{id}` |

## Limites production

- **Tâches async** : persistance PostgreSQL (`pipeline_jobs`) — compatible plusieurs réplicas Railway (polling partagé).
- **Temps restant** : non estimé ; le pipeline complet expose `step_timings` (secondes par étape) dans `result.stats`.
- **Collecte** : `error_breakdown` agrège les erreurs RSS (dns, timeout, http_*, etc.).
- **Traduction** : `error_breakdown` + `error_samples` ; articles exclus après `MAX_TRANSLATION_FAILURES` échecs (défaut 5, colonne `translation_failure_count`).
- **Observabilité** : header `X-Request-ID` (réponse) ; logs structlog avec `correlation_id` ; sonde **`GET /health/ready`** (DB) ; métriques **`olj_*`** sur `/api/metrics/prometheus` ; traces OTLP si `OTEL_EXPORTER_OTLP_ENDPOINT`.
- **Playwright** : [RAILWAY_PLAYWRIGHT.md](RAILWAY_PLAYWRIGHT.md) ; smoke UI `frontend/e2e` (`npm run test:e2e`).
- **BFF** : `NEXT_PUBLIC_API_MODE=proxy` + route Next `/api/proxy/*` (clé API côté serveur).

## Déploiement production

Voir **[DEPLOY.md](DEPLOY.md)** (Alembic, variables, `/health/ready`, `/api/metrics`, clé interne, limites de débit).

**Opérations** : [RUNBOOK.md](RUNBOOK.md).

## Tests

- `pytest tests/test_pipeline_task_store.py`
- Intégration Postgres : `RUN_INTEGRATION=1 pytest tests/test_integration_postgres.py -q` (Docker)
- Front : `npm run test:e2e` (Playwright)

## Aller plus loin

- **SSE** : moins de requêtes que le polling.
- **WebSocket** : si besoin bidirectionnel.
