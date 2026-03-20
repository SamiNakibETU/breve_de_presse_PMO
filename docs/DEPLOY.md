# Déploiement production (ROI)

## 1. Base PostgreSQL

1. Créer une base Postgres (Railway, Neon, RDS, etc.).
2. Définir **`DATABASE_URL`** (ou `database_url`) au format :
   - `postgresql+asyncpg://user:pass@host:5432/dbname`  
   - ou `postgresql://...` (l’app normalise vers `asyncpg`).

## 2. Migrations Alembic (recommandé)

Depuis le dossier `backend/` :

```bash
alembic upgrade head
```

Enchaînement des révisions (ordre) :

1. `a1b2c3d4e5f6` — `topic_clusters`, embedding, `cluster_id`
2. `b2c3d4e5f6a7` — `pipeline_jobs`
3. `c3d4e5f6a7b8` — `articles.translation_failure_count`
4. `e5f6a7b8c9d0` — index `(status, collected_at)`, `translation_failure_count`, `pipeline_jobs(status, created_at)` + backfill NULL

> Si tu ne lances pas Alembic, `init_db()` tente des `ALTER TABLE ... IF NOT EXISTS` au démarrage : pratique en dev, **moins strict** qu’Alembic seul en prod.

## 3. Variables d’environnement essentielles

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Postgres |
| Au moins une clé LLM | `GROQ_API_KEY` / `CEREBRAS_API_KEY` / `ANTHROPIC_API_KEY` |
| `COHERE_API_KEY` | Embeddings + clustering |
| `ENVIRONMENT` | ex. `production` |
| `LOG_JSON` | `true` pour logs JSON (agrégation Datadog / Loki / CloudWatch) |
| `FRONTEND_URL` + `CORS_ORIGINS` | Front autorisé |
| `PLAYWRIGHT_BROWSERS_PATH` | Ne pas surcharger avec `/tmp/...` sans install — voir [RAILWAY_PLAYWRIGHT.md](RAILWAY_PLAYWRIGHT.md) |

Optionnel :

- `MAX_TRANSLATION_FAILURES` — plafond d’échecs traduction par article (défaut 5).
- `TRANSLATION_JSON_REPAIR` — `false` pour désactiver la 2ᵉ passe JSON (coût).
- `GROQ_TRANSLATION_MODEL_FALLBACK` — modèle Groq plus petit en secours si 429 sur le modèle principal (EN/FR).
- `INGESTION_LLM_GATE_POST_BODY_ENABLED` — second passage gate LLM après extraction page (défaut `false`).
- `INGESTION_LLM_GATE_SUMMARY_MAX_CHARS` — taille max. du texte envoyé au gate (résumé RSS / extrait).
- **Alertes e-mail (phase 4)** : `ALERT_EMAIL_WEBHOOK_URL` (POST JSON, même schéma que `ALERT_WEBHOOK_URL`) ; ou **`RESEND_API_KEY`** + **`ALERT_EMAIL_TO`** (destinataires, virgules) + optionnel **`ALERT_EMAIL_FROM`**.
- **PDF revue Unicode** : `PDF_EXPORT_ENABLED=true` ; placer **DejaVuSans.ttf** sur l’image ou définir **`PDF_UNICODE_FONT_PATH`** / **`MEMW_PDF_FONT_PATH`** (sinon repli ASCII).
- **`MEE_RSS_FR_URL`** — réservé : flux RSS FR Middle East Eye si l’OLJ le fournit (pas de branchement collecte sans URL validée).

### Front Next.js : mode BFF (recommandé si API exposée)

Pour ne **pas** mettre `INTERNAL_API_KEY` dans le navigateur :

1. Côté Next (variables **serveur** uniquement) : `BACKEND_INTERNAL_URL`, `INTERNAL_API_KEY` (même valeur que le backend).
2. Côté client : `NEXT_PUBLIC_API_MODE=proxy` (les requêtes passent par `/api/proxy/...`).

Voir `frontend/.env.example`.

## 4. Santé & métriques

- **`GET /health`** — vivacité simple.
- **`GET /health/ready`** — base joignable (503 si échec).
- **`GET /api/metrics`** — compteurs cumulatifs depuis le boot (tâches pipeline, erreurs traduction agrégées, etc.). À protéger derrière réseau privé ou auth si exposé publiquement.
- **`GET /api/metrics/prometheus`** — format Prometheus : métriques **`olj_*`** (SLO) + compteurs historiques **`app_*`**.
- **Rate limiting** (slowapi) sur les POST coûteux (`/api/collect`, `/api/pipeline`, `/api/pipeline/tasks`, `/api/reviews/generate`, `/api/clusters/refresh`, etc.).

### Traces OpenTelemetry (optionnel)

Si `OTEL_EXPORTER_OTLP_ENDPOINT` (ou `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) est défini, l’API exporte les traces FastAPI + client HTTPX vers OTLP HTTP. `OTEL_SERVICE_NAME` personnalise le nom du service.

### SLO & PromQL

Voir **[SLO.md](SLO.md)** (exemples sur `olj_pipeline_*`, `olj_llm_*`).

## 5. Tâches pipeline async

Les jobs **`POST /api/pipeline/tasks`** sont stockés en table **`pipeline_jobs`** : plusieurs réplicas peuvent poller le même `task_id` tant qu’ils partagent la même base.

## 6. Docker / Railway

- Build avec le [`backend/Dockerfile`](../backend/Dockerfile) (Playwright Chromium inclus).
- Commande de démarrage : voir [`backend/railway.toml`](../backend/railway.toml).

## 7. CI

GitHub Actions : [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — backend `pytest` + intégration Postgres (Testcontainers), front `lint` + `build` + smoke **Playwright**.

## 8. Runbook

[RUNBOOK.md](RUNBOOK.md) — incidents fréquents (Playwright, Cohere, 429, DNS, clé interne).
