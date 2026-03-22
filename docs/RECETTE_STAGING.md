# Recette MEMW — staging (checklist manuelle)

Pour le chemin complet vers une **recette « 100 % »** (infra + organisation), voir [MEMW_ATTEINDRE_100.md](MEMW_ATTEINDRE_100.md).

À exécuter sur l’environnement **staging** (ex. Railway) après déploiement backend + frontend alignés.

## Pré-requis

- Migrations Alembic appliquées (`alembic upgrade head`), y compris `relevance_band`, `translation_quality_flags`, `dedup_feedback`.
- Variables : `INTERNAL_API_KEY` cohérente backend / frontend (Bearer) ; `COHERE_API_KEY` ; clés LLM.
- `CLUSTERING_USE_UMAP` laissé à `true` sauf diagnostic explicite (voir [`backend/.env.example`](../backend/.env.example)).

## Parcours journaliste (≤ 30 min — spec A1)

1. Ouvrir `/` — redirection vers `/edition/YYYY-MM-DD` (fuseau Beyrouth).
2. Parcourir **Sommaire → Sujet → Composition** sans erreur bloquante.
3. Vérifier **Copier / export** sur l’écran composition.
4. Confirmer l’absence de **JSON brut** ou **stack trace** en cas d’erreur API (production masque le détail — [`app.py`](../backend/src/app.py)).

## Pipeline technique

1. Lancer un **traitement complet** ou les étapes depuis la régie / dashboard (selon habilitation).
2. Vérifier l’absence d’erreur dans le bloc **embedding** (Sprint 1).
3. Ouvrir `/regie/pipeline` et `/regie/logs` — les tableaux se remplissent si des lignes existent en base (`pipeline_debug_logs`, `llm_call_logs`).

## Régie

1. `/regie/curator` — historique des appels `prompt_curator_v2` si curation exécutée.
2. `/regie/dedup` — lignes dédup + formulaire de signalement (test optionnel avec un UUID article valide).

## Non automatisé ici

- Alertes métier (H2), Prometheus : hors périmètre de cette checklist.
