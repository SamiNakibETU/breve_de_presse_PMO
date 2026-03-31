# Playbook — remédiation collecte (sans modifier `collector.py`)

## 1. Diagnostiquer

1. `python -m src.scripts.export_media_sources_health --csv data/MEDIA_HEALTH_EXPORT.csv` — colonne `diagnostic_bucket`.
2. Sources **RSS** : `python -m src.scripts.validate_rss_feeds --output data/RSS_VALIDATION_REPORT.json`.
3. Sources **hubs revue** : `python -m src.scripts.validate_media_hubs` ou `verify_scrape_one_per_rubrique`.

## 2. Corriger les données (`media_sources`)

- **Flux cassé** : mettre à jour `rss_url` / `rss_opinion_url` (migration Alembic additive ou script admin + `seed_media` régénéré).
- **Hub opinion** : éditer `opinion_hub_urls_json` (liste JSON d’URLs) en cohérence avec le CSV.
- **Méthode** : `collection_method` ∈ `rss` | `scraping` | `playwright` | `opinion_hub`.
- **Doublons** : enrichir `backend/data/MEDIA_SOURCE_ALIAS_GROUPS.json` pour l’agrégation santé.

## 3. Corriger le code scraper

| Méthode | Fichier | Clé |
|---------|---------|-----|
| HTTP + trafilatura | `src/services/web_scraper.py` | `SOURCE_CONFIGS[source_id]` + `collection_method: scraping` |
| Playwright | `src/services/playwright_scraper.py` | `PLAYWRIGHT_CONFIGS[source_id]` + `collection_method: playwright` |
| Hub JSON / overrides | `src/services/opinion_hub_overrides.py`, `hub_collect`, `hub_playwright` | selon domaine |

## 4. Valider avant merge

```bash
python -m src.scripts.verify_scrape_one_per_rubrique --ids VOTRE_SOURCE_ID --strict-exit-code
```

Smoke : relancer sur 2–3 `id` voisins non modifiés.

## 5. Hors périmètre

- Paywall / login : documenter `hors_scope` ; ne pas « contourner » les mesures techniques.
- Toute évolution d’**orchestration** dans `collector.py` nécessite une **dérogation** explicite au projet (règle AGENTS.md).

Voir aussi [MEMW_SCRAPING_ITERATION.md](MEMW_SCRAPING_ITERATION.md), [MEMW_LEGITIMATE_SCRAPING_SCOPE.md](MEMW_LEGITIMATE_SCRAPING_SCOPE.md), et `python -m src.scripts.verify_media_revue_registry_vs_csv`.
