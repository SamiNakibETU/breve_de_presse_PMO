# Plan backend & produit LLM — post-validation UI

Ce document complète la vision produit ; l’implémentation UI cible **`frontend/src`** et **`DESIGN_SYSTEM/`**. Les dossiers `design/prototype/` et `design/revue-playground/` restent de l’**expérimentation** (non contractuelle) — voir `design/revue-playground/README.md`.

**Onboarding agent** : `docs/ONBOARDING.md` (prompt court + pointeurs vers ce fichier et les specs).

---

## 1. Analyse d’article — pourquoi certains textes n’en ont pas

### Pipeline actuel

- Service : `backend/src/services/article_analyst.py` (`ANALYSIS_VERSION = article_analysis_v1`).
- Déclenché par le scheduler / tâches pipeline : `run_article_analysis_pipeline` avec filtre optionnel `edition_id` et `force`.

### Conditions de **skip** (pas d’analyse persistée)

| Condition | Code / comportement |
|-----------|---------------------|
| Analyse désactivée | `article_analysis_enabled` → `False` dans `Settings` (`backend/src/config.py`) |
| Pas de résumé FR | `summary_fr` vide → `skipped: no_summary_fr` |
| Hors périmètre | `relevance_band == out_of_scope` |
| Déjà analysé | `analyzed_at` non nul **sauf** si `force=True` sur le job |
| Plafond de batch | `article_analysis_batch_limit` (défaut 120, max 500) : seuls les N premiers candidats (tri `collected_at` desc) sont traités par passage |
| Filtre édition | Si `edition_id` est passé, seuls les articles de cette édition sont candidats — le reste n’est pas traité dans ce run |
| Erreur LLM | `llm_failed` : pas de mise à jour des champs d’analyse |

### Candidats inclus

- Statuts : `translated`, `needs_review`, `formatted`.
- `relevance_band` : `NULL`, vide, ou `high` / `medium` / `low` (pas `out_of_scope`).

### Pistes d’évolution (backlog)

- File d’attente explicite ou **priorisation** : `relevance_band` + `article_type` (opinion, éditorial, tribune, analyse) avant brèves / actualité.
- Surface dans l’UI : badge « Analyse en attente » / « Hors batch » pour réduire la confusion rédactionnelle.
- Documenter dans la Régie le dernier résultat `article_analysis` (compteurs `candidates`, `analyzed`, `skipped_articles`).

---

## 2. Unification résumé / analyse / affichage

### Constats front actuels

- Double marqueur dans le modal : liste ordonnée + glyphe `•/◇/◆` (`frontend/src/contexts/article-reader.tsx`) alors que le LLM peut déjà fournir du texte avec puces.
- Champs distincts : `summary_fr`, `thesis_summary_fr`, `analysis_bullets_fr`, `factual_context_fr`, `author_thesis_explicit_fr`, etc.

### Pistes (sans modifier les fichiers interdits par `AGENTS.md`)

- **Affichage** : une seule liste numérotée pour les idées majeures ; normaliser en amont les chaînes (strip préfixes `-`, `•`, lignes vides) dans un module **autorisé** (ex. utilitaire TS ou service Python hors fichiers interdits).
- **Produit** : écran unique « Synthèse lecture » combinant chapô + 5 points + lien corps — à spécifier après prototype.
- **Prompt / schéma** : évolution de `backend/config/prompts/article_analysis_v1.yaml` et schéma JSON associé **si** la gouvernance du dépôt le permet (pas dans `generator.py`, etc.).

---

## 3. Normalisation des pays (Israël / Israel, etc.)

### Cause

- Les stats `by_country` agrègent souvent des **libellés** tels qu’en base ou retournés par la jointure médias (`backend/src/routers/articles.py` et routes stats).
- Deux orthographes ou deux sources créent **deux clés** dans le dictionnaire.

### Pistes

- Source de vérité : `country_code` (ISO) partout en agrégation ; libellé FR via table de correspondance (ex. coverage targets / config).
- Migration ou script de **nettoyage** des `media_source` / articles sans `DROP` (conformité migrations).
- API : retourner `counts_by_country` comme `Record<code, number>` + `labels_fr` côté client si besoin.

---

## 4. Embeddings, clustering et périmètre éditorial

### Rôle actuel (rappel)

- Embeddings / HDBSCAN : fenêtre `CLUSTERING_WINDOW_HOURS`, sujets et regroupements dans le pipeline métier (voir `AGENTS.md`).

### Objectif produit

- Prioriser **opinion, éditorial, tribune, analyse** issus du registre validé (`MEDIA_REVUE_REGISTRY.json` / CSV médias revue), réduire le bruit type dépêches courtes non pertinentes pour la revue de presse **opinion**.

### Pistes

- Pondération ou **filtrage amont** par `article_type` et/ou score de pertinence avant batch d’embeddings.
- Alignement avec les **overrides** hub (`OPINION_HUB_OVERRIDES.json`) et la doc `docs/MEMW_LEGITIMATE_SCRAPING_SCOPE.md`.
- Ne pas confondre : conformité légale = dossiers entreprise ; ici = **réglage produit** sur le périmètre algorithmique.

---

## 5. Corps traduit — mise en forme

### Problème observé

- Texte collé (« phrase. Date. 0 commentaire. ») : mélange contenu article et artefacts de page ; manque de paragraphes.

### Pistes

- Renforcer l’extraction / nettoyage dans les services **autorisés** (ex. `smart_content`, `hub_article_extract`, `selected_article_fulltext` — hors liste interdite).
- Côté affichage : `frontend/src/lib/editorial-body.ts` (déjà des helpers) ; étendre la segmentation par blancs lignes et règles éditoriales.

---

## 6. « Voix 1 / Voix 2 » (Panorama / sujets)

- Clarifier en UI le sens : **plus récente dans le dossier**, **contraste géographique**, etc. — texte d’aide unique dans le **MetaStrip** ou tooltip aligné sur le design system (`design/prototype`).
- Unifier le libellé entre Panorama clusters et cartes édition une fois le wording validé en prototype.

---

## 7. Pipeline par date & modes « rapides »

### Besoin produit

- Lancer la pipeline pour une **date d’édition donnée** : utiliser d’abord les articles **déjà en base** pour cette fenêtre ; si incomplet, **rescraper / re-collecter** en remontant jusqu’à couvrir la plage horaire métier (Beyrouth), puis enchaîner traduction, analyse, sujets, etc.
- Pour les données **récentes** (ex. **3 derniers jours** encore « chauds » en base) : pouvoir enchaîner **étape par étape** jusqu’à la fin **sans** relancer l’étape scrape (coûteuse), avec choix explicite des étapes côté Régie / UI.

### Pistes techniques

- Cartographier les jobs existants (scheduler, routes Régie, `PIPELINE_*` dans `backend/src/config.py`) et les paramètres `edition_id`, `force`, fenêtres `window_start` / `window_end`.
- Exposer un flux API + UI : « Date cible » → diagnostic couverture corpus vs fenêtre → proposer **Compléter collecte** vs **Suite pipeline seulement**.
- Documenter les risques (doublons, limites RSS, coûts Playwright) dans le backlog ci-dessous ou, pour une rédaction longue, dans une copie locale `archive/docs-ops-2026-04-06/` (anciens runbooks).

---

## 8. Performance sélection d’articles (UI + API)

### Symptômes

- Latence entre **cocher / décocher** un article et la mise à jour du **sticky** bas de page (compteurs, liste).
- Même friction à la **suppression** d’une sélection.

### Pistes diagnostic (front)

- Profiler : `useSelectionStore` (Zustand), invalidations React Query (`useQueryClient`), re-renders de listes longues, appels réseau synchrones à chaque toggle.
- Optimistic updates + debounce batch si l’API est appelée article par article.
- Vérifier si le **full refetch** de l’édition ou des topics est déclenché à tort.

### Pistes diagnostic (back)

- Routes PATCH sélection / édition : nombre de requêtes, N+1 SQL, serialisation lourde.

---

## 9. Page Rédaction & artefacts « sources »

### UI

- Espace journaliste clair sur `/edition/.../compose` : recommandations **conditionnelles** (ex. seulement sans articles sélectionnés), version minimaliste — voir aussi la phase UX dans [`docs/superpowers/specs/2026-04-06-phase-ux-design-system-design.md`](./superpowers/specs/2026-04-06-phase-ux-design-system-design.md).

### Backend / données

- **Sources affichées** : strictement le périmètre **registre médias revue** (`MEDIA_REVUE_REGISTRY.json` / CSV), pas d’artefacts d’anciennes listes.
- **Santé / état** en Régie : chiffres alignés sur la réalité (dernière collecte, erreurs, volumes) — croiser `media_sources_health_payload`, jobs ingestion, `docs/MEDIA_REVUE.md`.

---

## 10. Sessions séparées par journaliste

### Besoin

- Chaque journaliste **sélectionne ses propres articles** (vues de sélection non partagées par défaut).

### Rappel produit (note issue du suivi debug)

- **Objectif** : permettre des **sessions séparées** pour que **chacun** puisse sélectionner **ses** articles (pas une sélection unique imposée à toute la rédaction sur le même écran).

### Pistes (à spécifier avant implémentation)

- Auth existante ou à introduire ; modèle `user_id` sur drafts / sélections / édition du jour.
- Scope API : filtrer `selected_article_ids` (ou équivalent) par utilisateur vs **sélection rédactionnelle globale** si besoin métier OLJ.
- Prérequis sans auth : pas de migration `user_id` obligatoire sur les liens de sélection tant que l’auth n’est pas validée (voir copie locale `archive/docs-ops-2026-04-06/JOURNALIST_SESSIONS_PREREQ.md` si présente).

---

## 11. Coûts & performances LLM

- S’appuyer sur `provider_usage_events`, `llm_call_logs`, dashboard Régie analytics (`AGENTS.md`).
- Relier choix produit (batch analyse, traduction, embeddings) aux **plafonds** documentés et aux retours UI (badges « hors batch », files d’attente).

---

## Phases de livraison (validées par le PO)

1. **Phase A — Backend ciblé** : rédaction, sources/registre, correctifs Panorama/Articles si données boguées ; nettoyage prompts/affichage analyse (hors fichiers interdits).
2. **Phase B — Uniformisation front** : design system, mobile, Panorama, thèmes/articles ; idéalement depuis prototype `design/` puis portage `frontend/`.
3. **Phase C — Tests & corrections** selon retours après déploiement (Railway, local).

_L’ordre « valider prototype / maquettes dans `design/` puis portage `frontend/src` » reste la voie privilégiée pour ne pas casser la prod tant que l’UI n’est pas figée._

---

## Ordre de travail recommandé (détail technique)

1. Valider le prototype (`design/`) et ajuster `DESIGN_SYSTEM/` en cohérence.
2. Porter les composants React vers `frontend/src` par bandes (édition → articles → dashboard).
3. Appliquer les correctifs backend dans l’ordre : **affichage / normalisation pays** (impact immédiat) → **file analyse / priorités** → **corps / extraction** → **embeddings** → **pipeline par date & modes partiels** → **perf sélection** → **sessions multi-utilisateurs** (quand spec prête).

---

## Specs techniques par vagues (découpage livrable)

Contrat d’ordre et détails par vague : dossier [`docs/superpowers/specs/`](./superpowers/specs/README.md) — index `README.md`, vue d’ensemble `2026-04-06-backend-waves-overview-design.md`, puis vagues 1 à 4 et phase UX / design system.

---

## 12. Carte de la documentation (dépôt)

Index à jour : [`docs/README.md`](./README.md).  
**Exploitation longue** (déploiement, incidents, SLO, recette staging, remédiation collecte, runbooks MEMW) : copie locale **`archive/docs-ops-2026-04-06/`** (non versionnée).

---

_Dernière mise à jour : 2026-04-06 — second passage : retrait des runbooks / ops détaillés du suivi git (archive locale `archive/docs-ops-2026-04-06/`). Premier nettoyage : `archive/docs-residues-2026-04-06/`. Onboarding : `docs/ONBOARDING.md`._
