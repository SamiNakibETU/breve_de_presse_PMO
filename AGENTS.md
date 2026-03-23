# AGENTS.md — Instructions pour l'agent Cursor

Ce fichier est lu automatiquement par Cursor. Il définit le contexte, les règles et le plan d'implémentation pour le projet Revue de Presse OLJ.

Voir `CURSOR_AGENT_PROMPT.md` à la racine pour le prompt système complet avec l'architecture, les décisions actées, et le plan phase par phase.

## Règles critiques (toujours actives)

1. Ne jamais modifier : `generator.py`, `editorial_scope.py`, `llm_router.py`, `collector.py`
2. Migrations Alembic additives uniquement — jamais de DROP
3. Tout le frontend en français
4. Italique pour les thèses dans l'UI, guillemets « » dans le texte généré uniquement
5. Tailwind uniquement, rouge OLJ `#c8102e`
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
