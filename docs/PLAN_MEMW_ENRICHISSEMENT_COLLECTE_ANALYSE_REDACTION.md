# Plan envisagé — Collecte enrichie, rétention, analyse LLM, UI, parcours rédaction

Document de cadrage pour la suite MEMW / revue de presse OLJ.  
Les numéros correspondent aux missions produit énoncées par la rédaction / tech.

---

## Contexte actuel (rappel)

- **Collecte backend** : `collector.py` (RSS), `web_scraper.py`, `playwright_scraper.py`, `opinion_hub_scraper.py` + modules `hub_*`, registre `MEDIA_REVUE_REGISTRY.json`, overrides `OPINION_HUB_OVERRIDES.json`.
- **Scraper autonome** (`scraper/retenu_final/olj_revue/`, **hors dépôt cible d’intégration telle quelle**) : `harvest.py`, `scrape_cascade.py` (UltraScraperV3), `smart_content.py`, découverte de liens Playwright, objectif « N articles / média » avec repli cascade, sortie JSON structurée.
- **Traduction / enrichissement** : `translator.py`, prompts YAML, flags `store_full_translation_fr`, Chain of Density, gates.
- **Pipeline** : scoring pertinence, dédup, embeddings, clustering, sujets, curateur, génération revue par sujet.
- **Rédaction** : sélections par sujet + extras serveur, page `compose`, consignes `compose_instructions_fr`.

---

## Mission 1 — Porter la logique du scraper « 100 % liens » dans l’architecture backend

**Objectif** : Ne pas dépendre du dossier `scraper/` en production, mais **réutiliser les idées et le code éprouvé** (cascade, filtrage de liens, harvest par média) **à l’intérieur** de `backend/src/services/` (nouveaux modules ou fusion avec `hub_collect`, `opinion_hub_scraper`, etc.).

**Axes techniques envisagés**

| Sujet | Direction |
|--------|-----------|
| Découverte de liens | Aligner `discover_article_links` + `smart_content` sur les heuristiques du scraper autonome ; garder une seule implémentation Playwright partagée (`hub_playwright` / quotas). |
| Récupération article | Intégrer la **cascade** (fetch HTTP → améliorations → repli) là où aujourd’hui trafilatura / aiohttp seuls échouent. |
| Paramétrage | **Plage de dates** (début / fin), **N articles max**, **médias filtrés** : exposer via config + CLI script + éventuellement endpoint Régie (protégé). |
| Registre | Continuer à lire `MEDIA_REVUE_REGISTRY.json` / DB `media_sources` comme source de vérité ; mapper `media_id` scraper ↔ `MediaSource.id`. |
| Sortie | Normaliser vers le modèle `Article` existant (`content_original`, métadonnées, `published_at`, `url`) sans casser l’ingestion actuelle. |
| Non-régression | Jeux de tests sur 3–5 médias représentatifs (anti-bot, RSS-only, hub-only) + comparaison volume / qualité vs run actuel. |

**Livrables** : module(s) backend documentés, script `run_*` ou intégration dans `run_collection`, mise à jour `docs/MEMW_*` et SLO si besoin.

---

## Mission 2 — Architecture de sauvegarde + traduction complète pour articles « sélectionnés sujet du jour »

**Objectif** : Tout article **sélectionné** pour un **grand sujet** de l’édition (et éventuellement règle étendue aux extras si produit le valide) doit être **conservé et traduit intégralement** sur une fenêtre **≥ 72 h** (ajustable), avec impact maîtrisé sur **taille DB** et **coûts**.

**Axes techniques envisagés**

| Sujet | Direction |
|--------|-----------|
| Ciblage | Déclencheur après `PATCH …/selection` ou job périodique : liste des `article_id` avec `is_selected` sur `edition_topics` de l’édition courante / récente. |
| Rétention | Flag ou table `article_retention_until` / `priority_corpus` ; TTL 72 h minimum ; pas de suppression agressive des corps pour ces IDs pendant la fenêtre. |
| Traduction | Forcer chemin « corps complet » (`content_translated_fr`) pour ces articles même si `store_full_translation_fr` reste false globalement (override par politique). |
| Stockage | Index, partitionnement logique ou archivage froid si volume explose ; respect **migrations additives uniquement**. |
| Juridique | Rappel : périmètre médias validé OLJ ; pas d’élargissement de sources. |

**Livrables** : migration(s), service `selected_article_fulltext_pipeline` (nom à trancher), métriques coût/tokens, doc opérateur.

---

## Mission 3 — Repositionner le LLM de la pipeline (résumé / analyse) — **priorité majeure**

**Objectif** : Ne plus produire un simple résumé « plat » ; traiter le modèle comme **expert revue MENA** avec **contexte minimal** (guerre / région, cadre OLJ), et sortie **structurée** :

1. **Compréhension** : distinguer **rappel factuel / chronologie** vs **prise de position / thèse** (souvent implicite en fin d’éditorial).
2. **Sorties** (exemple de contrat, à affiner au prompt) :
   - Synthèse claire de ce que dit l’article (sans bullshit).
   - **Thèse de l’auteur** mise en avant (y compris si elle est en partie « cachée » derrière du récap).
   - **Jusqu’à 5 bullet points** (ou moins si le texte est court) : idées majeures, arguments, lignes de force du raisonnement.
3. **Ordre des étapes LLM** : imposer d’abord les **bullet points / analyse** puis résumé si ça améliore la qualité (comme demandé : forcer la lecture avant la reformulation).

**Impacts code envisagés**

- Nouveau schéma JSON (outil structuré ou parse strict) dans les prompts d’enrichissement post-extraction (probablement `translator.py` / bundles YAML / `Chain of Density`).
- Colonnes ou JSONB sur `articles` : `analysis_bullets_fr`, `author_thesis_fr`, `summary_intelligent_fr`, etc. (noms à valider).
- Consommateurs : scoring pertinence, sujets (`topic_detector`), clusters, **UI** (fiche article, modal lecture, compose).
- **Ne pas** mélanger avec le prompt `generate_review_v2` (rédaction finale) sans séparation claire des responsabilités.

**Livrables** : spec prompt + schéma, migration, tests sur corpus annoté (même petit), rollback feature-flag.

---

## Mission 4 — UI / UX (design system existant)

**Objectif** : Afficher les **nouvelles sorties** (bullets, thèse enrichie, corps complet) partout où c’est utile ; **supprimer les résidus** d’anciennes versions (textes placeholder, onglets vides, doublons d’info).

**Écrans prioritaires**

- Modal / page **Lecture article** : onglets ou sections hiérarchisés (Analyse · Synthèse · Corps · Source).
- **Édition du jour** / **TopicSection** : aperçus basés sur bullets + thèse courte.
- **Rédaction** : cohérence avec les nouvelles métadonnées (sans surcharger).
- **Panorama / clusters** : optionnel selon API disponible.

**Contraintes** : Tailwind, rouge OLJ, français, pas de `any` TS, accessibilité (titres, listes).

---

## Mission 5 — Refonte parcours **Rédaction** (au-delà du correctif récent)

**Objectif** : Parcours **clair de bout en bout** : sommaire → sélection → **atelier rédaction** (ordre des sujets, preview des analyses, consignes, prévisualisation globale) → génération → export — sans chemins parallèles confus (`/review` vs compose, etc.).

**Pistes**

- Wizard ou étapes numérotées persistées.
- Réordonnancement des **sujets** (rank `EditionTopic`) côté UI + API.
- Tableau de bord « prêt à rédiger » (seuils : 2+ articles / sujet, traduction complète OK).
- Décision produit : fusion ou redirection explicite depuis l’ancien flux **Revue** ad hoc.

---

## Ordre de dépendance recommandé

1. **Audit** (agent dédié + synthèse) — voir `PROMPT_AUDIT_ARCHITECTURE_OPUS46.md`.
2. **M3** (contrat analyse LLM + colonnes) en parallèle **M1** (risque découpé par média).
3. **M2** une fois le contrat de données M3 stabilisé (champs à afficher / indexer).
4. **M4** + **M5** sur branche UI après API stable.

---

## Risques transverses

- **Coût LLM** : multiplication de tokens si corps complet + long prompt expert sur tout le corpus → cibler M2/M3 sur sélection + corpus édition.
- **Temps pipeline** : budgets `pipeline_step_timeout_*` à revoir.
- **AGENTS.md** : fichiers interdits à modifier (`generator.py`, `llm_router.py`, etc.) — contourner par nouveaux services / prompts YAML sauf validation explicite.

---

*Document vivant — à mettre à jour après l’audit Opus 4.6.*
