# Compte rendu exhaustif — MEMW / Projet_guerre (revue de presse OLJ)

**Document :** audit technique et éditorial pour lecteur externe (aucun prérequis sur l’historique de conversation).  
**Référence dépôt :** `https://github.com/SamiNakibETU/breve_de_presse_PMO.git`  
**Branche :** `v2/media-watch`  
**Commit de référence (correctifs santé sources, dédup sémantique, auteurs clusters) :** `1f4f0cc`  
**Date de rédaction :** 22 mars 2026 (état du dépôt au moment du push).

---

## 1. Objet du produit

Application **Media Watch** : collecte multi-sources (RSS, scrapers, hubs d’opinion), traduction et structuration en français (LLM), embeddings (Cohere), regroupement thématique (HDBSCAN), libellage de sujets (LLM), présentation type **revue de presse régionale** pour **L’Orient-Le Jour**. L’interface vise une lecture « publication d’abord » (cf. `AGENTS.md` à la racine).

---

## 2. Stack technique

| Couche | Composants |
|--------|------------|
| API | FastAPI, préfixe `/api` |
| Persistance | PostgreSQL, SQLAlchemy async |
| Pipeline quotidien | `backend/src/services/scheduler.py`, tâches async `pipeline_async_jobs.py` |
| Embeddings | Cohere — `backend/src/services/embedding_service.py` |
| Clustering | HDBSCAN (± UMAP) — `clustering_service.py` |
| LLM | Anthropic (traduction, libellés) — `llm_router`, bundles YAML sous `backend/config/prompts/` |
| Frontend | Next.js (App Router), dashboard pipeline, clusters |

**Fichiers pivots pour un audit de chaîne :**

- `backend/src/services/scheduler.py` — enchaînement collecte → traduction → embeddings → syndication → dédup sémantique → clustering → labellisation.
- `backend/src/services/semantic_dedupe.py` — cosinus sur embeddings, marquage syndication / canonique.
- `backend/src/services/clustering_service.py` — HDBSCAN, fenêtre temporelle, types éditoriaux.
- `backend/src/services/cluster_labeller.py` + `backend/config/prompts/cluster_label_v2.yaml` — titres de sujets.
- `backend/src/routers/articles.py` — `GET /api/media-sources/health`.
- `backend/src/routers/clusters.py` — liste clusters, détail articles, `POST /api/clusters/refresh`.
- `backend/src/services/source_health_metrics.py` — agrégats traduction 24 h persistés dans `health_metrics_json`.

---

## 3. Symptômes observés (staging, journaux mars 2026)

### 3.1 Pipeline complet (~3330–3340 s)

- **Collecte** ~1690 s, **traduction** ~1610 s : goulet principal **réseau + LLM**, pas les embeddings seuls.
- **Collecte :** ~141 nouveaux articles, ~47 filtrés hors périmètre ; forte part des **hubs d’opinion** ; erreurs ponctuelles (DNS, timeout) sur des sources isolées.
- **Traduction :** ~202 succès, ~64 « à relire », ~3 `retry_exhausted` (souvent `ValueError` dans la chaîne de retry).
- **Champ JSON `embedding.error` :** message *« The truth value of an array with more than one element is ambiguous… »*.

### 3.2 Attribution trompeuse dans le JSON pipeline

Dans `scheduler.py`, un **unique** `try/except` couvre : embeddings → syndication (simhash) → **déduplication sémantique** → **clustering** → **labellisation**. Toute exception est stockée sous `pipeline_result["embedding"] = {"error": ...}`, ce qui peut faire diagnostiquer à tort une panne **Cohere** alors que l’échec est **post-embedding** (ex. `semantic_dedupe`).

### 3.3 Charge sur `/api/media-sources/health`

Logs applicatifs : pour **chaque** source active, exécution de plusieurs `COUNT` sur `articles` et une requête sur `collection_logs` — coût **O(nombre de sources)** en requêtes SQL.

### 3.4 PostgreSQL

- **`duplicate key value violates unique constraint "articles_url_key"`** : même URL insérée deux fois (ex. paramètre `?traffic_source=rss`, ou deux `media_source_id` pour un même article).
- **SSL / connection reset / unexpected EOF** : fréquent sur hébergement managé ; souvent corrélé à fermetures clientes ou scaling.

### 3.5 Dashboard « État des sources »

Avant correctif : nombreuses lignes **« 0 traductions (24 h) »** malgré un run massif, dû à **plusieurs fiches `media_sources` (IDs différents)** pour un **même média** — métriques calculées par ID sans agrégation.

### 3.6 Cartes clusters (qualité perçue)

- Libellés du type **« Hétérogène : revue de presse à resynchroniser »** : **sortie LLM** (pas de chaîne codée en dur) lorsque les extraits du cluster sont **éditorialement mixtes** alors que HDBSCAN les a rapprochés vectoriellement.
- **Auteur = URL Facebook** : valeur brute dans `articles.author` (flux RSS / site).
- **Extraits « bancals »** : liés à `thesis_summary_fr` et à la qualité traduction / source.

---

## 4. Causes racines

| Problème | Cause |
|----------|--------|
| Erreur numpy « truth value of an array… » | Dans `semantic_dedupe.py`, utilisation de `if a.embedding` alors que `embedding` peut être un **ndarray** (ou équivalent pgvector) : évaluation booléenne interdite en Python. |
| Métriques santé incohérentes | Comptage strict sur un seul `media_source_id` sans fusion des **alias** historiques / registre. |
| Libellés « Hétérogène… » | Prompt `cluster_label_v2` + liste hétérogène d’articles dans un cluster **mathématiquement** groupé. |
| Pas de re-libellage au refresh | `label_clusters` ne traite que `TopicCluster.label IS NULL`. |
| Doublons URL | Absence de normalisation d’URL et de politique `ON CONFLICT` à l’insertion. |

---

## 5. Correctifs inclus dans le commit `1f4f0cc`

### 5.1 Déduplication sémantique

- **Fichier :** `backend/src/services/semantic_dedupe.py`
- Test **explicite** `raw is None`, puis `len(raw)` ; dimension 1024 ; plus de vérité booléenne sur le vecteur brut.

### 5.2 Alias `media_source_id` (santé + traduction 24 h)

- **Données :** `backend/data/MEDIA_SOURCE_ALIAS_GROUPS.json` — groupes explicites (ex. Daily Sabah, Gulf News, MEE, Times of Israel, Jordan Times, etc.).
- **Module :** `backend/src/services/media_source_aliases.py` — `equivalent_media_source_ids()`.
- **`GET /api/media-sources/health` :** `backend/src/routers/articles.py` — agrégation des compteurs **72 h**, **traductions 24 h**, et **dernier log de collecte** sur l’ensemble des IDs du groupe ; champs `alias_aggregate_ids`, `translation_metrics_note_fr`.
- **`source_health_metrics.py` :** `fetch_translation_24h_counts_by_source`, `sum_translation_24h_for_aliases` ; `refresh_translation_metrics_24h` propage le **même total agrégé** sur chaque fiche du groupe.

### 5.3 Auteurs affichés (clusters)

- **Fichier :** `backend/src/routers/clusters.py` — `clean_author_for_display` : masque URL en tête de chaîne, sous-chaînes `facebook.com/`, `twitter.com/`, `x.com/`.
- Utilisé pour les **thesis previews** (liste) et le **détail** cluster.

### 5.4 Frontend

- `frontend/src/lib/types.ts` — types pour la note et `alias_aggregate_ids`.
- `frontend/src/components/dashboard/pipeline-status.tsx` — affichage de `translation_metrics_note_fr`.

### 5.5 Tests

- `backend/tests/test_media_source_aliases.py`

---

## 6. Points non traités ou à valider en production

| Priorité | Action |
|----------|--------|
| P0 | **Déployer** la branche contenant `1f4f0cc` sur l’environnement cible (Railway, etc.). |
| P1 | **Scinder** les `try/except` dans `scheduler.py` pour un diagnostic JSON fidèle par étape. |
| P1 | **Normalisation d’URL** et/ou `ON CONFLICT DO NOTHING` sur `articles.url`. |
| P2 | **Optimiser** `/media-sources/health` (agrégations SQL groupées + fusion alias côté Python). |
| P2 | **Renforcer** `cluster_label_v2.yaml` (interdiction des libellés méta) ; procédure de **reset** `label` + refresh pour clusters existants. |
| P2 | **Sanitizer** `author` à la collecte ou dans le prompt de traduction (persistance propre). |
| P3 | Analyse ciblée des articles en `retry_exhausted`. |

---

## 7. Risques résiduels

- Nouveaux **doublons d’ID** non ajoutés dans `MEDIA_SOURCE_ALIAS_GROUPS.json` → métriques partiellement fausses jusqu’à mise à jour du fichier.
- **HDBSCAN** ne garantit pas la cohérence éditoriale ; tension durable entre **vecteur** et **sujet rédactionnel**.
- **Secrets** : `COHERE_API_KEY`, clés LLM, `INTERNAL_API_KEY` — à vérifier dans la doc déploiement (`docs/DEPLOY.md`, `docs/RUNBOOK.md`).

---

## 8. Glossaire

- **MEMW** : Media Watch (spécification produit).
- **HDBSCAN** : clustering par densité sur embeddings.
- **Simhash** : détection de quasi-doublons textuels (syndication).
- **Dédup sémantique** : cosinus sur embeddings pour canonique / syndiqué.
- **`thesis_summary_fr`** : thèse courte par article (LLM).
- **`TopicCluster.label`** : titre de sujet affiché (LLM).

---

## 9. Synthèse exécutive

Le pipeline **tient la charge** (gros volumes, durées cohérentes). Les incidents documentés venaient surtout d’un **bug de typage booléen sur embeddings** en dédup sémantique, d’**agrégats santé non fusionnés** entre alias de médias, de **doublons d’URL** sans stratégie d’insertion, et d’une **dissonance éditoriale / vectorielle** sur les clusters. Le commit **`1f4f0cc`** adresse les trois premiers axes côté code (dédup, santé/alias, affichage auteur) ; le **déploiement** et les **évolutions prompt / URL / scheduler** restent le levier pour fermer le reste.

---

*Document généré pour audit externe ; mise à jour recommandée après chaque release majeure du pipeline ou du registre médias.*
