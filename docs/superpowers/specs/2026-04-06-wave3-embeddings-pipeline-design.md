# Spec — Vague 3 : embeddings / clustering ; pipeline par date

**Date :** 2026-04-06  
**Références :** [docs/plan.md](../../../plan.md) §4, §7 ; [AGENTS.md](../../../AGENTS.md).

## 1. Embeddings & clustering (périmètre opinion)

### Contexte

- Fenêtre : `CLUSTERING_WINDOW_HOURS` (config [`backend/src/config.py`](../../../backend/src/config.py)).
- Services : [`backend/src/services/clustering_service.py`](../../../backend/src/services/clustering_service.py), [`backend/src/services/embedding_service.py`](../../../backend/src/services/embedding_service.py) (ou équivalent selon arborescence réelle).

### Objectifs

- **Filtrage ou pondération amont** : prioriser `article_type` opinion / éditorial / tribune / analyse pour les batchs d’embedding **sans** modifier `collector.py`.
- **Alignement registre** : cohérence avec le périmètre [`MEDIA_REVUE_REGISTRY.json`](../../../backend/data/MEDIA_REVUE_REGISTRY.json) et overrides [`OPINION_HUB_OVERRIDES.json`](../../../backend/data/OPINION_HUB_OVERRIDES.json).
- **Métriques** : exposer ou journaliser le ratio « articles embeddés hors opinion » pour ajuster les seuils.

### Critères d’acceptation

- Comportement par défaut documenté : quels statuts / types entrent dans la file d’embedding.
- Aucune régression sur le bruit manifeste (dépêches courtes) mesurée sur un jour de test en staging.

### Hors-scope

- Contournement légal ou collecte hors liste (voir `docs/MEMW_LEGITIMATE_SCRAPING_SCOPE.md`).

## 2. Pipeline par date & modes « rapides »

### Besoin produit

- Lancer la pipeline pour une **date d’édition** : utiliser d’abord le corpus en base pour la fenêtre **[window_start, window_end)** en **Asia/Beirut** ; si incomplet, **re-collecter** jusqu’à couvrir la plage, puis enchaîner traduction, analyse, sujets, etc.
- Pour données **récentes** (~3 j) : enchaîner **étape par étape** sans relancer scrape, avec choix explicite (Régie / API interne).

### Objectifs techniques

- Cartographier jobs existants (scheduler, routes Régie, `PIPELINE_*` dans config) et paramètres `edition_id`, `force`, fenêtres.
- **API** : flux « date cible » → diagnostic (articles dans fenêtre vs attendu) → actions proposées : `Compléter collecte` | `Pipeline seulement` (étapes sélectionnables).
- **Documentation** : risques doublons, limites RSS, coûts Playwright — consigner dans `docs/plan.md` ou copie locale `archive/docs-ops-2026-04-06/` (anciens runbooks).

### Critères d’acceptation

- Une édition donnée peut être **reprise** sans double scrape involontaire quand l’opérateur choisit « pipeline seulement ».
- Logs ou réponse API suffisamment explicites pour le support rédactionnel.

### Contraintes

- Ne pas modifier `collector.py` pour la logique métier nouvelle si interdit : orchestration dans routes / services de pipeline autorisés, ou document d’écart pour governance.
