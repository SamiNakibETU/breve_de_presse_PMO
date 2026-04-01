# Prompt — Audit architectural & plan d’implémentation (agent Opus 4.5 / 4.6, Cursor)


**Langue de travail** : français pour les livrables ; citations de code peuvent rester en anglais si nécessaire.

---

## Ton rôle

Tu es un **architecte logiciel senior** + **lead produit technique** chargé de produire un **audit exhaustif** du dépôt **Projet_guerre / revue de presse OLJ** et un **plan d’implémentation état de l’art** pour cinq chantiers majeurs. Tu ne dois **pas implémenter** dans ce premier passage : tu **analyses**, **décides**, **structures** et **livres** un document actionnable (phases, fichiers, migrations, risques, métriques).

---

## Contexte métier (à respecter)

- Outil interne **L’Orient-Le Jour** : revue de presse **régionale** (opinion / éditoriaux), périmètre médias **validé** (`MEDIA_REVUE_REGISTRY.json`, cadre juridique hors dépôt).
- **Édition du jour** : fenêtre **Asia/Beirut** ; liste articles globale ≠ fenêtre édition.
- Contraintes dépôt : lire **`AGENTS.md`** (fichiers interdits à modifier, migrations Alembic **additives** uniquement, frontend FR, Tailwind, `#dd3b31`, TS strict).

---

## Chantiers à couvrir (objectifs détaillés)

### 1. Intégration de la logique du scraper autonome

- Le dossier **`scraper/`** (notamment `retenu_final/olj_revue/` : `harvest.py`, `scrape_cascade.py`, `smart_content.py`, Playwright, etc.) contient une chaîne qui vise un **taux élevé de succès** sur les liens nécessaires.
- **Ne pas** « monter » le dossier `scraper/` tel quel en prod : **porter** les mécanismes dans **`backend/src/services/`** (collecte / hubs), alignés sur `MediaSource`, registre, overrides, `Article`.
- Permettre des **modes d’usage** : plage **date → date**, **N articles**, sous-ensemble de médias, sans casser le pipeline quotidien existant.
- Proposer **où** couper les responsabilités (éviter duplication Playwright), comment **tester** et **monitorer**.

### 2. Sauvegarde + traduction complète des articles sélectionnés pour les sujets du jour

- Tout article **coché / sélectionné** pour un **grand sujet** d’édition doit être **conservé** (TTL **≥ 72 h**, paramétrable) et recevoir une **traduction complète du corps** (politique distincte du flag global `store_full_translation_fr` si pertinent).
- Proposer schéma SQL (JSONB vs colonnes), jobs, idempotence, impact **stockage** et **RGPD / usage interne** (rappel : sources tierces).

### 3. Pipeline LLM d’analyse — **priorité absolue**

- Aujourd’hui le LLM de la pipeline produit surtout un **résumé** ; la cible est une **analyse experte** (contexte **minimal** guerre / Moyen-Orient pertinent pour la revue).
- Sortie attendue (contrat à préciser) :
  - Distinction **rappel factuel / chronologie** vs **avis / thèse** (souvent en fin de texte).
  - **Thèse de l’auteur** explicite même si implicite.
  - **Jusqu’à 5 puces** (ou moins selon longueur) : idées majeures, arguments, lignes de force.
- **Enchaînement** : imposer en premier une étape qui **force la compréhension** (ex. bullets / structure) avant synthèse longue, pour limiter la « complétion statistique ».
- Préciser : prompts, schémas JSON, **quel service** (`translator`, nouveau `article_analyst`, post-ingestion), interaction avec **relevance** et **topic_detector**, feature flags.

### 4. UI / UX (design system actuel)

- Exposer les **nouvelles données** (bullets, thèse analytique, corps complet) dans **modal lecture**, **fiches**, **édition**, **rédaction**.
- **Retirer** résidus d’anciennes UX (textes morts, doublons, onglets vides).
- Respecter **tokens** et **français**.

### 5. Parcours **Rédaction** (refonte)

- Le flux **sommaire → bandeau → page compose** a été amélioré mais reste **perfectible**.
- Proposer un **parcours utilisateur** clair (étapes, états, erreurs, chargements), éventuellement **réordonnancement des sujets**, indicateurs « prêt à générer », cohabitation avec `/review` si encore pertinent.
- S’appuyer sur une **exploration réelle** du site déployé (voir ci-dessous).

---

## Méthode d’audit imposée

1. **Lire `AGENTS.md`** et **`docs/PLAN_MEMW_ENRICHISSEMENT_COLLECTE_ANALYSE_REDACTION.md`** (plan de référence).
2. **Cartographier le code** sans exception utile :
   - `backend/src/services/` (collecte, `translator`, `topic_detector`, scoring, pipeline, `edition_review_generator`, `hub_*`, etc.)
   - `backend/src/routers/`, `models/`, `schemas/`, `alembic/`
   - `frontend/src/app/edition/`, `components/edition`, `composition`, `contexts/article-reader`, `lib/api.ts`, `types.ts`
   - Prompts YAML / bundles chargés par le backend
3. Pour chaque chantier, lister les **fichiers touchés**, **dépendances**, **risques de régression**, **ordre de merge** recommandé.
4. **Navigation web** : ouvrir (outils navigateur ou équivalent) **`https://revue-de-presse-olj.up.railway.app/edition/2026-04-01`** (et au besoin **2026-03-31**, **Panorama**, **Rédaction**, **Articles**, **Régie**) et noter **frictions UX**, états vides (« 0 sélection », chargements), incohérences de libellés ou de navigation.
5. Comparer avec le scraper autonome : **lire** `scraper/retenu_final/README.md`, `harvest.py`, `scrape_cascade.py`, `smart_content.py` pour identifier **ce qui manque** dans le backend actuel.

---

## Livrables attendus (format de ta réponse finale)

1. **Résumé exécutif** (10–15 lignes) pour la direction technique.
2. **État des lieux** par domaine (collecte, DB, LLM pipeline, API, front).
3. **Architecture cible** (schéma texte ou mermaid) : flux données de la collecte jusqu’à la rédaction.
4. **Spécification du contrat LLM « analyse experte »** : schéma JSON, exemples entrée/sortie, ordre des appels, budgets tokens.
5. **Plan de migration DB** (liste de révisions Alembic **additives**).
6. **Plan d’implémentation par phases** (Sprint 0 audit → S1 …) avec **critères de done** et **tests** (pytest, e2e si utile).
7. **Risques** (coût, latence pipeline, droits contenu, dette `AGENTS.md` fichiers interdits) et **mitigations**.
8. **Liste de décisions ouvertes** à trancher par le PO / juridique.

---

## Règles

- Ne pas proposer de **DROP** SQL ni de modifier les fichiers **interdits** sans signaler explicitement l’exception et une alternative.
- Toute affirmation sur le comportement actuel doit être **vérifiable** (fichier + symbole ou route API).
- Si une information manque, le **noter** et proposer comment la collecter (log, métrique, spike).

---

## Rappel final

Ta sortie doit permettre à une équipe de **coder immédiatement** après toi, sans repasser par une phase floue d’« amélioration continue ». Sois **précis**, **priorisé**, et **honnête** sur les compromis.

---

*Généré pour handoff Cursor — Projet OLJ revue de presse.*
