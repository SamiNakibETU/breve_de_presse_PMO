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
| `services/pipeline_task_store.py` | Stockage mémoire (FIFO max ~80 tâches) |
| `services/pipeline_async_jobs.py` | Exécution + `on_progress` |
| `services/collector.py` | `run_collection(on_progress=…)` |
| `services/translator.py` | `run_translation_pipeline(on_progress=…)` |
| `services/scheduler.py` | `daily_pipeline(on_progress=…)` |
| `routers/pipeline.py` | `POST /pipeline/tasks`, `GET /pipeline/tasks/{id}` |

## Limites production

- **Un seul worker** : le store est en RAM. Plusieurs réplicas Railway → **Redis** ou table `pipeline_jobs`.
- **Temps restant** : non estimé sans historique ; seules les **étapes** et le **temps écoulé** côté client sont fiables.

## Tests

`pytest tests/test_pipeline_task_store.py`

## Aller plus loin

- **SSE** : moins de requêtes que le polling.
- **WebSocket** : si besoin bidirectionnel.
