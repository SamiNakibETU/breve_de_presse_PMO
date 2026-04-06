# Fichier « media revue » (CSV)

**Emplacement recommandé (défaut des scripts)** : à la **racine du dépôt**, nom exact :

`media revue - Sheet1.csv`

Les scripts `import_media_revue_csv`, `verify_scrape_one_per_rubrique` et `reconcile_media_csv_db` le cherchent là **automatiquement** s’il existe. Tu peux aussi passer un autre chemin en argument.

Alternative : copie versionnée sous `docs/sources/media-revue-sheet1.csv` et appelle les scripts avec ce chemin.

Chaîne usuelle (CSV à la racine) :

```bash
cd backend
python -m src.scripts.import_media_revue_csv
python -m src.scripts.verify_media_revue_registry_vs_csv
python -m src.scripts.seed_media
python -m src.scripts.reconcile_media_csv_db --hints-out data/RECONCILE_HINTS.txt
python -m src.scripts.verify_scrape_one_per_rubrique --output data/SCRAPING_E2E_MATRIX.json
```

Périmètre légal de la collecte : [MEMW_LEGITIMATE_SCRAPING_SCOPE.md](../MEMW_LEGITIMATE_SCRAPING_SCOPE.md). Remédiation et lots : [MEMW_BATCH_RUNBOOK.md](../MEMW_BATCH_RUNBOOK.md), [SOURCE_REMEDIATION_PLAYBOOK.md](../SOURCE_REMEDIATION_PLAYBOOK.md).

Colonnes attendues du CSV : **Pays**, **nom**, **langue**, **url**, **catégories** (URLs d’opinion), **notes** (optionnel). Voir [MEDIA_REVUE.md](../MEDIA_REVUE.md).
