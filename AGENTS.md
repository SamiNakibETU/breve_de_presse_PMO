# AGENTS.md — Instructions pour l'agent Cursor

Ce fichier est lu automatiquement par Cursor. Il définit le contexte, les règles et le plan d'implémentation pour le projet Revue de Presse OLJ.

Documentation longue / brouillons : dossier local `archive/` (ignoré par git).

## Règles critiques (toujours actives)

1. Ne jamais modifier : `generator.py`, `editorial_scope.py`, `llm_router.py`, `collector.py`
2. Migrations Alembic additives uniquement — jamais de DROP
3. Tout le frontend en français
4. Italique pour les thèses dans l'UI, guillemets « » dans le texte généré uniquement
5. Tailwind uniquement, rouge OLJ `#dd3b31` (tokens `--color-accent` / `accent`)
6. Types stricts partout — pas de `any` côté TS

## Temporalités (référence unique)

- **Édition du jour** : fenêtre **Asia/Beirut** (ex. mar–ven : veille 18:00 → jour J 06:00). Les sujets LLM, les compteurs `corpus_*` sur l’édition et **`GET /api/articles?edition_id=…`** filtrent sur **`collected_at`** dans `[window_start, window_end)`.
- **Liste Articles (`/articles`)** : glissant **`days`** (ex. 2 j) depuis **maintenant en UTC** ; ce n’est **pas** la fenêtre d’édition.
- **Stats `total_collected_24h`** : **24 h UTC**, toutes éditions confondues (vigie globale).
- **Santé des sources** : volumes sur **72 h** (`window_hours` API).
- **Clustering** : `CLUSTERING_WINDOW_HOURS` (défaut 48 h) pour le périmètre embedding/HDBSCAN.
- **Traduction auto** : `TRANSLATION_AUTO_MAX_AGE_DAYS` (défaut 14) + plafond `TRANSLATION_PIPELINE_BATCH_LIMIT`.
- **RSS** : entrées ignorées au-delà de `INGESTION_RSS_ENTRY_MAX_AGE_DAYS` (défaut 7).

## Ordre d'exécution

Phase 1 → modèles + migration
Phase 2 → enrichir traduction (editorial_angle, score persisté)
Phase 3 → route DailyEdition + recherche texte
Phase 4 → normalisation pays
Phase 5 → types TS + API client
Phase 6 → page Édition du jour (LE livrable principal)
Phase 7 → indicateur couverture géographique
Phase 8 → concurrence traduction
Phase 9 → tests

## Dashboard analytique & coûts API (pistes — à implémenter)

Objectif : monitorer l’usage rédactionnel et centraliser les coûts des appels LLM / API.

### Usage (événements côté app)

- **Option A** : middleware **FastAPI** (ou équivalent) qui écrit des lignes dans une table `usage_events` : route, méthode, durée, `user_id` si auth, `edition_id` / `topic_id` quand présents dans le contexte.
- **Option B** : hook **Next** (middleware ou instrumentation client) pour les vues / actions UI, même schéma ou envoi vers un collecteur.
- **Option C** : outil tiers (**Plausible**, **PostHog**, etc.) pour vues et clics sans tout stocker en base — complémentaire aux événements métier.

### Coûts LLM / API

- À chaque appel : log structuré ou ligne en base : `provider`, `model`, `prompt_tokens`, `completion_tokens`, coût estimé (tarif connu ou table de prix).
- **Job d’agrégation** quotidien (ou horaire) : sommes par jour / modèle / route déclencheuse.
- **UI** : page **Régie** ou **`/dashboard`** en lecture seule sur ces agrégats (pas besoin d’édition).

### Suite possible

- Page dashboard dédiée : schéma SQL minimal + 2–3 endpoints (`GET` stats période, détail par modèle).
- Affiner les **libellés de groupe thème** côté API (`labels_fr` / clés racine) si le regroupement frontend ne suffit pas.
