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

### Railway : pourquoi `railway run alembic` échoue avec `getaddrinfo failed`

Sur Railway, la variable **`DATABASE_URL`** du backend pointe souvent vers **`*.railway.internal`**. Ce nom n’est résolvable **que depuis l’intérieur** du projet Railway (conteneurs sur le même réseau). Depuis ton PC (PowerShell), la résolution DNS échoue → **`socket.gaierror: [Errno 11001] getaddrinfo failed`**.

**Deux approches valides :**

1. **Lancer les migrations dans le réseau Railway** (recommandé si tu ne veux pas exposer Postgres)  
   - `railway ssh` (service **Backend_PMO**, même environnement que staging).  
   - Dans le shell : aller dans le répertoire de l’app (souvent `/app` ou celui du `WORKDIR` du Dockerfile), puis :  
     `alembic upgrade head` ou `python -m alembic upgrade head`.

2. **Lancer Alembic depuis ta machine avec une URL « publique »**  
   - Dans le dashboard Railway : service **Postgres** → onglet **Connect** / **Variables** : copier l’URL avec hôte **public** (proxy TCP, souvent du type `*.proxy.rlwy.net` avec un port, **pas** `railway.internal`).  
   - PowerShell, depuis `backend/` :  
     `$env:DATABASE_URL = "postgresql://..."` (l’URL publique complète)  
     puis `alembic upgrade head`.  
   - Selon l’offre Railway, ajouter **`?sslmode=require`** (ou équivalent) peut être nécessaire pour asyncpg ; en cas d’erreur SSL, vérifier la doc du connecteur Postgres affichée par Railway.

**À éviter :** coller une URL `postgres.railway.internal` dans `$env:DATABASE_URL` sur ta machine — elle ne fonctionnera pas hors Railway.

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
- **`TRANSLATION_AUTO_MAX_AGE_DAYS`** — traduction auto : articles hors fenêtre (parution ou collecte) ignorés ; `0` = pas de filtre.
- **`INGESTION_RSS_ENTRY_MAX_AGE_DAYS`** — RSS : entrées plus vieilles que N jours ignorées ; `0` = pas de filtre.
- **`TRANSLATION_PIPELINE_BATCH_LIMIT`** — plafond d’articles traduits **par passage** après les filtres ci-dessus (débit / coût).

Au démarrage, `init_db()` ajoute aussi les colonnes **`media_sources.health_*`** et champs **`collection_logs`** si elles manquent (déploiement sans Alembic complet).

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

## 9. Vérification en amont (avant un pipeline complet)

À faire **dans l’ordre** sur l’environnement cible (staging / prod) :

1. **Même base que le backend**  
   Confirmer que `DATABASE_URL` du service API est **la même** base sur laquelle tu as lancé `alembic upgrade head` (pas une base vide ou un autre projet Railway).

2. **Migrations à jour**  
   - En SSH Railway (`railway ssh`) depuis `/app` : `alembic current` puis comparer avec `alembic heads` en local sur la branche déployée.  
   - Ou depuis ta machine avec l’URL Postgres **publique** : `cd backend` puis `alembic current`.

3. **API prête**  
   - `GET /health` → 200.  
   - `GET /health/ready` → 200 (sinon Postgres inaccessible ou schéma incohérent).

4. **Clés et modèles LLM**  
   - Au moins une de `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `ANTHROPIC_API_KEY`.  
   - Vérifier que `GROQ_TRANSLATION_MODEL` (et fallback) existent encore côté [Groq](https://console.groq.com/docs/models) — un nom obsolète provoque des `NotFoundError` (le routeur bascule désormais sur les candidats suivants, mais les IDs doivent rester valides).  
   - `COHERE_API_KEY` présent si tu veux embeddings / clustering.

5. **Comportement embedding (optionnel)**  
   Si tu t’attends à beaucoup d’articles embeddés après traduction : `EMBED_ONLY_EDITORIAL_TYPES=false` élargit aux types hors opinion/analyse (plus de coût Cohere).

6. **Après déploiement**  
   - Logs backend : plus de `column ... does not exist` côté Postgres au premier chargement des sources / articles.  
   - Lancer un **petit** test : `POST /api/pipeline/tasks` avec `kind: translate` sur un lot limité, ou pipeline complet une fois les points ci-dessus OK.  
   - Surveiller `translation.errors` vs `processed` dans la réponse pipeline et les logs `llm.translate_try_next_provider` (bascule fournisseur / modèle).

7. **Sécurité**  
   Ne pas commiter d’URL Postgres avec mot de passe ; régénérer le mot de passe si une URL a fuité dans un ticket ou un chat.

## 10. Smoke test rapide (sans relancer toute la pipeline)

Remplace `https://TON-BACKEND.railway.app` par l’URL réelle du service API.

**Tout en GET** — pas de coût LLM, pas de collecte :

| Vérification | URL | Attendu |
|----------------|-----|---------|
| API vivante | `GET .../` | JSON avec liens `docs`, `health`, etc. |
| Santé | `GET .../health` | `{"status":"ok",...}` |
| Base OK | `GET .../health/ready` | 200 + `database: ok` (503 si Postgres / schéma) |
| Scheduler | `GET .../api/status` | JSON avec jobs planifiés (peut être vide) |
| Métriques | `GET .../api/metrics` | 404 si `EXPOSE_METRICS=false`, sinon JSON |
| Données | `GET .../api/articles?limit=5` | Liste (éventuellement vide) |
| Agrégats 24 h | `GET .../api/stats` | Compteurs par statut |
| Clusters | `GET .../api/clusters` | Liste de clusters |
| Sources | `GET .../api/media-sources/health` | `sources` + pas d’erreur 500 |

**Navigateur** : ouvre `https://TON-BACKEND.../docs` → tu peux exécuter chaque **GET** avec « Try it out ».

**Optionnel — tester un peu de traduction** (coût / temps LLM) :  
`POST .../api/translate?limit=3` avec le header **`X-Internal-Key`** = valeur de `INTERNAL_API_KEY` du backend (ou passer par le BFF Next si configuré). Sans cette clé : 401.

**Ne pas confondre** : un `GET` sur une ancienne tâche `.../api/pipeline/tasks/{uuid}` renvoie 404 si la tâche a expiré — ce n’est pas un signe que l’API est cassée.
