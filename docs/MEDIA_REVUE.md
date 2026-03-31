# Liste « media revue » (CSV → base → collecte)

## 1. Fichier source

Feuille **`media revue - Sheet1.csv`** à la racine du repo (colonnes : Pays, nom, langue, url, catégories = URLs d’opinion, notes).

## 2. Générer le registre JSON

Depuis `backend/` (CSV à la racine du dépôt : `media revue - Sheet1.csv`) :

```bash
python -m src.scripts.import_media_revue_csv
```

Sortie : **`backend/data/MEDIA_REVUE_REGISTRY.json`**.

**Contrôle d’alignement** (après chaque édition du CSV) :

```bash
python -m src.scripts.verify_media_revue_registry_vs_csv
```

Tant que ce script ne répond pas `aligned: true`, le JSON **ne correspond pas** au CSV : régénérer avec `import_media_revue_csv`.

Les sites marqués « doesn’t open » / « acces denied » dans les notes sont **`is_active: false`**.

## 3. Seed base de données

```bash
python -m src.scripts.seed_media
```

Fusionne **`MEDIA_REGISTRY.json`** + **`MEDIA_REVUE_REGISTRY.json`** (les entrées revue **écrasent** les champs en cas de même `id`).

Nouvelle colonne : **`opinion_hub_urls_json`** (liste JSON d’URLs).

## 4. Collecte

Lors d’une collecte (cron ou `POST /api/collect`), après RSS / web / Playwright, le pipeline exécute **`opinion_hub`** :

- Télécharge chaque URL de hub (liste / rubrique opinion).
- Extrait les liens article (même domaine, heuristiques de chemin).
- Extrait le texte avec **trafilatura** (comme le `web_scraper`).

Sites entièrement en **SPA / anti-bot** : ajouter un profil dans `web_scraper.SOURCE_CONFIGS` + `collection_method: scraping`, ou étendre Playwright par domaine.

## 5. Valider tous les hubs (réseau réel)

Depuis `backend/` (plusieurs minutes ; respecte des pauses entre domaines) :

```bash
python -m src.scripts.validate_media_hubs
python -m src.scripts.validate_media_hubs --max-media 15
python -m src.scripts.validate_media_hubs --no-article-sample
```

Rapport : **`data/HUB_VALIDATION_REPORT.json`** (fetch OK, nombre de liens, test trafilatura sur 1 article par hub).

### 5 bis — Matrice E2E (1 article / rubrique CSV)

Même logique que `validate_media_hubs`, avec matrice aplatie `rubrique_matrix` et option **CSV** direct :

```bash
python -m src.scripts.verify_scrape_one_per_rubrique --output data/SCRAPING_E2E_MATRIX.json
python -m src.scripts.verify_scrape_one_per_rubrique --csv "../docs/sources/media-revue-sheet1.csv"
```

## 5 ter — RSS (sources `rss` / `rss_opinion_url`)

```bash
python -m src.scripts.validate_rss_feeds --output data/RSS_VALIDATION_REPORT.json
```

## 5 quater — Export santé API + diagnostic

```bash
python -m src.scripts.export_media_sources_health --output data/MEDIA_HEALTH_EXPORT.json --csv data/MEDIA_HEALTH_EXPORT.csv
```

## 5 quinte — Réconciliation CSV ↔ base

```bash
python -m src.scripts.reconcile_media_csv_db --csv "../docs/sources/media-revue-sheet1.csv" --hints-out data/RECONCILE_HINTS.txt
```

Playbook correctifs : [SOURCE_REMEDIATION_PLAYBOOK.md](SOURCE_REMEDIATION_PLAYBOOK.md). SLA interne : [MEMW_SOURCE_SLA.md](MEMW_SOURCE_SLA.md).

## 6. Faire évoluer la liste

1. Modifier le CSV.
2. Relancer `import_media_revue_csv`.
3. Relancer `seed_media`.
4. Redémarrer l’API si besoin.
