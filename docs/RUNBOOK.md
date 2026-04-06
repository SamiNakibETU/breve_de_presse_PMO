# Runbook opérations (1 page)

Symptômes courants en production et actions rapides.

## Édition incomplète / relance sans rescrape

1. **`GET /api/editions/{edition_id}/pipeline-diagnostic`** (clé interne) : taille du corpus, traduits sans embedding, pistes d’action — voir [`PIPELINE_MAINTENANCE.md`](PIPELINE_MAINTENANCE.md) §1. Côté UI, la page **Régie → Collecte** (`/regie/pipeline`) relie chaque suggestion au bloc **Actions** (`#regie-pipeline-actions`).
2. Pour **ne pas** relancer la collecte : tâches Régie **étape par étape** (`POST /api/pipeline/tasks`) avec `edition_id` ciblé.
3. Plafonds batch affichés dans **`GET /api/status`** → `batch_limits` (cohérent avec les payloads `article_analysis` en base).

## Playwright : « Executable doesn't exist »

1. Vérifier le build Docker et [`RAILWAY_PLAYWRIGHT.md`](RAILWAY_PLAYWRIGHT.md).
2. Ne pas définir `PLAYWRIGHT_BROWSERS_PATH` vers `/tmp` sans binaires installés au build.
3. Redéployer après correction.

## Cohere absent / embeddings ignorés

1. Logs : `pipeline.cohere_key_missing` ou `embedding` en erreur dans le résultat pipeline.
2. Définir `COHERE_API_KEY` sur l’environnement, redémarrer.
3. Relancer **Refresh clusters** ou pipeline complet.

## 429 / rate limit Groq (ou autre LLM)

1. Logs : `RateLimitError` ou message API contenant `429` ; métrique `olj_llm_requests_total{outcome="rate_limited"}`.
2. Le routeur tente automatiquement **`GROQ_TRANSLATION_MODEL_FALLBACK`** puis d’autres providers si configurés.
3. Réduire la fréquence des tâches (cron) ou `translate_limit`.
4. Ajouter une 2ᵉ clé / provider si besoin (Cerebras, Anthropic).
5. L’API applique aussi des **limites slowapi** sur `/api/collect`, `/api/pipeline`, etc. — espacer les clics dashboard.

## DNS / timeout sur un flux RSS

1. Collecte : voir `error_breakdown` (`dns`, `timeout`) et le détail des erreurs par `source`.
2. Vérifier l’URL dans `media_sources` (outil externe `curl`).
3. Désactiver temporairement la source (`is_active: false`) ou augmenter timeout côté code si besoin.

## JSON traduction invalide en masse

1. Stats traduction : `error_breakdown.json_parse`.
2. Vérifier `LLM_USE_JSON_OBJECT_MODE` (défaut true) ; désactiver seulement si l’API refuse.
3. `TRANSLATION_JSON_REPAIR=true` (défaut) : une passe de réparation ; surveiller coût.
4. Articles bloqués : vue **Traduction (erreurs)** + **Réessayer traduction** ou **Abandonner**.

## 401 X-Internal-Key

1. Si `INTERNAL_API_KEY` est défini, tout endpoint protégé (collecte, pipeline, revue, batch articles, refresh clusters) exige le header `X-Internal-Key`.
2. Front : préférer **`NEXT_PUBLIC_API_MODE=proxy`** + `INTERNAL_API_KEY` **côté serveur Next** uniquement (`BACKEND_INTERNAL_URL`). Sinon `NEXT_PUBLIC_INTERNAL_API_KEY` (exposé au navigateur — réseau privé seulement).
3. Scripts : `curl -H "X-Internal-Key: …"`.

## Métriques / santé

- `GET /health` — vivacité.
- `GET /health/ready` — base OK (503 sinon).
- `GET /api/metrics` — JSON compteurs.
- `GET /api/metrics/prometheus` — scrape Prometheus (`olj_*` + historique).

Requêtes d’alerting types : [SLO.md](SLO.md).

## SLO indicatifs (à adapter)

| Indicateur | Cible de travail |
|------------|------------------|
| Tâche pipeline async | Statut `done` sans `error` dans le résultat |
| Collecte planifiée | Durée &lt; 30 min (selon volume) |
| Disponibilité API | `/health/ready` 200 |

## Alertes source « dead » / cluster chaud

1. **`ALERT_WEBHOOK_URL`** : POST JSON (`media_source_health` ou `cluster_hot`).
2. Optionnel : **`ALERT_EMAIL_WEBHOOK_URL`** (même payload vers un second endpoint).
3. Optionnel : **Resend** — `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` (domaine vérifié en prod).

## Export PDF sans accents

1. Vérifier **`PDF_UNICODE_FONT_PATH`** ou **`MEMW_PDF_FONT_PATH`** vers un fichier **`.ttf`** (ex. DejaVuSans), ou installer `fonts-dejavu-core` sur l’image Linux (`/usr/share/fonts/truetype/dejavu/`).
2. Sans police : le PDF utilise le repli ASCII (accents supprimés).

---

Voir aussi [DEPLOY.md](DEPLOY.md) et [PIPELINE_MAINTENANCE.md](PIPELINE_MAINTENANCE.md).
