# Prompt d’audit — Agent Cursor / revue de presse MEMW (OLJ)

Copier-coller le bloc suivant dans une **nouvelle conversation** avec un agent disposant du dépôt `Projet_guerre` (branche à jour, idéalement `v2/media-watch` ou `main`).

---

## Rôle

Tu es un **auditeur technique + éditorial** sur une application Next.js + FastAPI : **revue de presse régionale** pour L’Orient-Le Jour. Ta mission est de **cartographier l’existant**, d’**identifier les écarts** avec une pratique « état de l’art » pour une rédaction, et de **proposer un plan d’implémentation priorisé** (avec critères de succès mesurables). Tu **exécutes** les changements seulement si l’utilisateur te le demande explicitement ; sinon tu livres un **rapport structuré** et des **prompts / specs** prêts à l’emploi.

## Contexte produit (à valider dans le code)

- **Édition du jour** : fenêtre **Asia/Beirut** ; corpus et API filtrés par rattachement édition (`edition_id` + repli temporel — voir `edition_schedule.sql_article_belongs_to_edition_corpus`).
- **Deux logiques distinctes côté UI** :
  1. **Sommaire / grands sujets** : développements du jour (LLM, `topic_detector`, sujets éditoriaux).
  2. **Affinités** : regroupements par **proximité sémantique** (embeddings / HDBSCAN, `TopicCluster`) — vocabulaire journalistique à harmoniser (« dossier d’affinités », « fiche », éviter « cluster » en interface utilisateur sauf régie technique).
- **Pipeline** : collecte → traduction → embeddings / clustering → détection sujets ; planificateur APScheduler (heure Paris), verrou pipeline complet.

## Contraintes de dépôt (obligatoires)

Lire **`AGENTS.md`** à la racine. En particulier :

- **Ne pas modifier** sans mandat explicite et plan validé : `generator.py`, `editorial_scope.py`, `llm_router.py`, `collector.py`.
- Migrations Alembic **additives** uniquement.
- Frontend **français** ; Tailwind ; accent OLJ `#dd3b31`.
- Types TS stricts (pas de `any`).

Si une amélioration « état de l’art » impose de toucher un fichier interdit, **documente** l’alternative (nouveau module, couche d’adaptation, feature flag) ou demande une **dérogation** avec risques.

## Périmètre d’audit

### 1. Clarté UI / parcours rédaction

- Page **`/edition/[date]`** : titres, rubriques, textes d’aide (fenêtre Beyrouth, jour J, corpus traduit, lien vers planificateur). Vérifier **cohérence** avec les libellés des boutons (**Actualiser**, **Traitement…**, **Pipeline serveur…**).
- Distinction **grands sujets** vs **affinités** : même vocabulaire partout (sommaire, détails repliables, `/clusters`, dashboard).
- Accessibilité : hiérarchie de titres, `aria-label`, contrastes.

### 2. Affinités (ex-clusters) — contenu et présentation

- Cartes liste (`ClusterCard`, `ClusterList`) : jusqu’à **trois voix** d’aperçu ; le backend fournit déjà jusqu’à 3 `thesis_previews` — vérifier **ordre** (récence, diversité pays/médias) et **qualité** des extraits (longueur, doublons).
- Page **fiche dossier** `/clusters/[id]` : alignement terminologique avec la liste.
- Proposer si besoin : **renommage d’URL** ou alias (`/dossiers/[id]`) — évaluer impact SEO, redirections, liens internes.

### 3. Grands sujets (topic detector + curator)

- Lire `topic_detector.py` (autorisé), schémas sujets, statuts `detection_status`.
- Diagnostiquer échecs fréquents : trop peu d’articles éditoriaux, 0 sujet après LLM, désalignement avec corpus affiché.
- Recommander **métriques** et **logs** côté prod pour la rédaction (sans jargon inutile dans l’UI).

### 4. Chaîne LLM / « rédaction à la traîne »

- **Inventaire** : quels champs sont envoyés au LLM (titres, résumés, extraits, contenu complet ?) pour traduction, labellisation, sujets, revue.
- **Gap analysis** vs bonnes pratiques revue de presse : utilisation du **texte intégral** quand pertinent, fenêtre de contexte, prompts versionnés, garde-fous anti-hallucination, coût/latence.
- Proposer une **feuille de route** : prompts YAML externalisés (hors fichiers interdits si nécessaire), A/B sur un sous-ensemble d’articles, évaluation humaine.
- **Ne pas** modifier les fichiers interdits dans ce cadre sans le signaler clairement.

### 5. Page dédiée « méthode / pour la rédaction »

- Spécifier une **nouvelle route** (ex. `/redaction` ou `/a-propos/revue`) : objectifs, définitions (fenêtre, corpus, grands sujets, affinités), ce que le bouton Actualiser fait ou ne fait pas, où voir les logs, qui contacter.
- Contenu **rédigé pour des journalistes**, pas pour des développeurs (pas de noms de variables en titre ; glossaire technique en annexe optionnelle).

## Livrables attendus

1. **Synthèse exécutive** (10–15 lignes).
2. **Tableau risques / priorités** (P0–P3) avec effort estimatif (S/M/L).
3. **Liste de fichiers** touchés par recommandation (chemins exacts).
4. **Spécifications** pour la page dédiée rédaction (plan de sections + texte français brouillon si possible).
5. **Prompts LLM** suggérés (system + user) pour une itération future, avec variables explicites.
6. **Checklist de tests** manuels + tests auto existants à lancer (`pytest`, `npm test`, etc. selon le repo).

## Méthode de travail

- Commencer par **lire** `AGENTS.md`, la page édition, `topic_detector.py`, `edition_schedule.py`, `routers/clusters.py`, composants `frontend/src/components/clusters/`, `edition-themes-view.tsx`.
- Citer le code avec des références **fichier + lignes** quand tu conclus.
- Terminer par les **3 prochaines actions** concrètes pour l’équipe.

---

Fin du prompt à copier.
