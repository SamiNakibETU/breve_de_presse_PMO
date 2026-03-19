# Roadmap collecte médias — revue de presse OLJ

Objectif éditorial : montrer **ce que disent les éditoriaux / tribunes** des médias régionaux sur les crises en cours, sans aspirer tout le site.

## État actuel (synthèse dépôt)

| Source de vérité | Fichier |
|------------------|---------|
| Registre des médias | `backend/data/MEDIA_REGISTRY.json` |
| Collecte RSS | `backend/src/services/collector.py` → `RSSCollector` (priorité `rss_opinion_url` puis `rss_url`) |
| Scraping HTTP | `backend/src/services/web_scraper.py` → `SOURCE_CONFIGS` |
| SPA / JS | `backend/src/services/playwright_scraper.py` → `PLAYWRIGHT_CONFIGS` |

Environ **8** flux RSS sont explicitement orientés opinion ; beaucoup d’autres restent des **fils généraux**. Plusieurs sources `scraping` / `playwright` **sans entrée** dans les dicts → **non collectées** (ex. OLJ, Al Akhbar, KUNA, Al Ghad, Roya selon config).

## Phase 2 — Audit par média (checklist)

Pour **chaque** `id` actif dans `MEDIA_REGISTRY.json` :

1. Ouvrir le site → repérer la rubrique **Opinion / Éditorial / Analyse / Tribune** (URL stable).
2. Choisir **une** stratégie :
   - **RSS dédié** si disponible → renseigner `rss_opinion_url` (ou remplacer `rss_url` si le flux général est trop bruité).
   - **Scraper d’index** : URL de liste + sélecteurs article (comme `SOURCE_CONFIGS`).
   - **Playwright** si la page est une SPA ou chargement dynamique.
3. Documenter dans une ligne : `id`, URL rubrique, méthode, fréquence acceptable, paywall.
4. Désactiver ou repousser les médias **hors périmètre** géographique si l’objectif est strictement MENA.

## Phase 3 — Tests locaux

1. `docker compose up -d` (Postgres) puis variables `.env` backend.
2. Pour **une** source à la fois : lancer la collecte ciblée (script ou endpoint pipeline) et vérifier en base : `url`, `title_original`, `article_type`, `content_original` non vide.
3. Vérifier la **traduction** sur un échantillon (titres FR + résumé).
4. Ajouter des tests unitaires sur les parseurs HTML quand une nouvelle source est ajoutée.

## Livrables recommandés

- Colonne ou fichier `docs/media_sources_audit.md` (une section par `id`).
- Mise à jour systématique de `MEDIA_REGISTRY.json` + clés dans `web_scraper.py` / `playwright_scraper.py` en même temps.
