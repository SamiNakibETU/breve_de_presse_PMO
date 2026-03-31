# SLO & requêtes Prometheus

Objectifs de travail (à affiner selon volume). Les séries **`olj_*`** sont exposées sur `GET /api/metrics/prometheus`.

## Indicateurs utiles

| Métrique | Rôle |
|----------|------|
| `olj_pipeline_tasks_created_total{kind="..."}` | File / démarrages |
| `olj_pipeline_tasks_terminal_total{status="done\|error",kind="..."}` | Taux de succès par type |
| `olj_pipeline_task_duration_seconds_bucket{kind="..."}` | Latence création → fin |
| `olj_llm_requests_total{provider,outcome}` | `outcome`: ok, error, rate_limit |
| `olj_llm_request_duration_seconds_bucket{provider}` | Latence LLM |

Les compteurs historiques `app_*` (JSON `inc("…")`) restent dans le même scrape pour rétrocompatibilité.

## Exemples PromQL

**Taux de succès des tâches pipeline (fenêtre 1 h)** — à adapter si scrape &lt; 1 min :

```promql
sum(rate(olj_pipeline_tasks_terminal_total{status="done"}[1h]))
/
sum(rate(olj_pipeline_tasks_terminal_total[1h]))
```

**Part des erreurs / rate limit LLM :**

```promql
sum(rate(olj_llm_requests_total{outcome!="ok"}[15m]))
/
sum(rate(olj_llm_requests_total[15m]))
```

**p95 durée tâche `translate` (histogramme)** — selon version Prometheus :

```promql
histogram_quantile(0.95, sum(rate(olj_pipeline_task_duration_seconds_bucket{kind="translate"}[1h])) by (le))
```

## Alertes (esquisse)

- `olj_pipeline_tasks_terminal_total{status="error"}` ↑ soutenue après un déploiement.
- `olj_llm_requests_total{outcome="rate_limited"}` ↑ : quota / besoin de 2ᵉ clé ou autre provider.

Voir aussi [RUNBOOK.md](RUNBOOK.md) et [MEMW_SOURCE_SLA.md](MEMW_SOURCE_SLA.md) (objectifs santé des sources / gate scraping optionnel).
