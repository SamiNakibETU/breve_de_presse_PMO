# Spec — Vague 4 : performance sélection ; sessions journaliste ; coûts LLM

**Date :** 2026-04-06  
**Références :** [docs/plan.md](../../../plan.md) §8, §10, §11 ; [AGENTS.md](../../../AGENTS.md).

## 1. Performance sélection d’articles

### Symptômes

- Latence entre cocher / décocher et mise à jour du bandeau sticky (compteurs, liste) — voir plan §8.

### Objectifs — diagnostic

- **Front** : profiler [`frontend/src/stores/selection-store.ts`](../../../frontend/src/stores/selection-store.ts) (Zustand), invalidations React Query ([`frontend/src/lib/api.ts`](../../../frontend/src/lib/api.ts)), re-renders de listes longues.
- **Stratégies** : optimistic updates ; debounce / batch si l’API est appelée article par article ; éviter refetch complet de l’édition à chaque toggle.

### Objectifs — backend

- Auditer routes PATCH sélection / édition : N+1 SQL, payloads lourds, sérialisation.

### Critères d’acceptation

- Latence perçue &lt; seuil défini avec le PO (ex. &lt; 200 ms pour toggle local + sync) sur liste de taille nominale (N articles à fixer en test).

## 2. Sessions séparées par journaliste

### Besoin

- Chaque journaliste a **ses propres** sélections / brouillons par défaut ; éventuelle vue « globale rédaction » si métier OLJ l’exige (à trancher).

### Prérequis (spec à figer avant code)

- **Auth** : mécanisme existant ou à introduire (session, JWT, SSO interne).
- **Modèle** : `user_id` sur entités de sélection / brouillon / édition du jour — migration **additive** uniquement.
- **API** : filtrage systématique des `selected_article_ids` (ou équivalent) par utilisateur.

### Critères d’acceptation

- Deux comptes test ne voient pas les sélections l’un de l’autre sans action explicite de « partage » si le produit l’exige ainsi.

### Hors-scope tant que spec auth absente

- Implémentation complète : cette section valide le **périmètre** ; les tickets Jira / PR suivent la spec auth validée par l’équipe.

## 3. Coûts & transparence LLM

### Contexte

- Tables / events : `provider_usage_events`, `llm_call_logs` ; UI Régie analytics ([AGENTS.md](../../../AGENTS.md)).

### Objectifs

- Relier **plafonds** (`article_analysis_batch_limit`, traduction, embeddings) aux **indicateurs** affichés ou documentés pour la rédaction.
- Lier badges « hors batch » (vague 2) aux agrégats coûts si pertinent.

### Critères d’acceptation

- Document ou écran Régie : « dernière exécution » avec coût estimé ou tokens agrégés par étape pipeline (niveau de granularité défini avec le PO).

## Dépendances

- Vague 3 stable pour ne pas multiplier les variables pendant le profilage perf.
- Vague 2 pour badges cohérents avec les métriques coûts.
