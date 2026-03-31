# Boucle d’amélioration de la collecte (sans objectif « 100 % »)

Objectif réaliste : **maximiser** le nombre de sources qui fournissent des articles d’opinion **en accès public**, avec des preuves testables.

## 0. Aligner CSV et JSON

À chaque changement du fichier **`media revue - Sheet1.csv`** (racine du dépôt) :

```bash
cd backend
python -m src.scripts.import_media_revue_csv
python -m src.scripts.verify_media_revue_registry_vs_csv
```

Si le script signale des écarts, le JSON n’est **pas** à jour : corriger le CSV ou régénérer jusqu’à `aligned: true`.

## 1. Tester tout le périmètre (une fois le JSON aligné)

```bash
python -m src.scripts.verify_scrape_one_per_rubrique --output data/SCRAPING_E2E_MATRIX.json
python -m src.scripts.validate_rss_feeds --output data/RSS_VALIDATION_REPORT.json
```

Durée : longue ; lancer de préférence hors heures critiques.

Itération par **lots de 5** (rapports `SCRAPING_BATCH_*.json`, diagnostics par hub) : [MEMW_BATCH_RUNBOOK.md](MEMW_BATCH_RUNBOOK.md).

## 2. Lire le rapport par type d’erreur

| Symptôme dans le rapport | Piste légale |
|--------------------------|----------------|
| `cloudflare_interstitial` | Flux RSS alternatif dans `OPINION_HUB_OVERRIDES.json` ; parfois aucune solution sans infrastructure dédiée / accord éditeur. |
| `rss` / `entry_count` 0 | URL de flux à corriger ; vérifier sur le site éditeur. |
| `hub_pas_assez_liens` | Structure HTML changée → fiche navigateur ([source_browser_investigation_template.md](source_browser_investigation_template.md)). |
| `FAIL_FILTRE` / hors périmètre | Scraper OK mais filtre éditorial ; distinct d’un bug technique. |

## 3. Implémenter une correction ciblée

- `backend/data/OPINION_HUB_OVERRIDES.json` (`rss_feed_url`, `rss_feed_urls`, `rss_link_filter`, `playwright`, `wait_ms`, etc.).
- `web_scraper.SOURCE_CONFIGS` / `playwright_scraper.PLAYWRIGHT_CONFIGS` si la source n’est pas en `opinion_hub`.
- **Ne pas modifier** `collector.py` ni `editorial_scope.py` sans décision projet (AGENTS.md).

## 4. Re-tester la source touchée

```bash
python -m src.scripts.verify_scrape_one_per_rubrique --ids VOTRE_ID --strict-exit-code
```

## 5. Accepter une limite

Certaines sources resteront en **degraded** / **dead** tant que le site impose une protection forte ou n’expose pas de flux public pour la rubrique visée. Ce n’est pas un échec de « perfection », c’est une **contrainte externe**.

### Exemple : Gulf News (opinion)

- La page `gulfnews.com/opinion` peut être **protégée** (écran type Cloudflare) même avec Playwright.
- Le flux principal `gulfnews.com/feed` répond souvent en **200**, mais les entrées récentes peuvent **ne contenir aucune URL** `/opinion/` : le filtre `rss_link_filter` dans `OPINION_HUB_OVERRIDES.json` peut alors renvoyer **0 lien** — ce n’est pas une « erreur de code », c’est un **manque de flux public opinion**.
- Pistes acceptables : chercher un **flux officiel** opinion sur le site éditeur, partenariat, ou accepter la source en **dégradé** jusqu’à évolution côté média.

Pour le cadre légal : [MEMW_LEGITIMATE_SCRAPING_SCOPE.md](MEMW_LEGITIMATE_SCRAPING_SCOPE.md).
