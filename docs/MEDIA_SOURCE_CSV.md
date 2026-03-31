# Liste de médias (CSV OLJ)

## Fichier canonique

- **Source de vérité** : feuille **Sheet1** du classeur « media revue ». Pour la versionner dans git, la copier sous [`docs/sources/media-revue-sheet1.csv`](sources/README.md) (voir README du dossier).
- À la racine du dépôt, `media revue - Sheet1.csv` peut exister en local mais n’est pas toujours suivie par git.
- Le fichier `media revue - Sheet1 (1).csv` est un doublon exporté ; ne pas l’utiliser pour regénérer le registre.

## Liban

Ce CSV **ne contient pas** de médias libanais (Annahar, Al-Akhbar, etc.). C’est cohérent si la revue vise surtout la **presse régionale hors Liban** tout en étant publiée par L’Orient-Le Jour. Si l’équipe éditoriale souhaite inclure des colonnes opinion libanaises, les ajouter au CSV puis ré-importer.

## Import vers la base

Depuis `backend/` (venv activé) :

```bash
python -m src.scripts.import_media_revue_csv "../media revue - Sheet1.csv"
python -m src.scripts.seed_media
```

Pour n’ingérer **que** le registre issu du CSV (sans fusion avec `MEDIA_REGISTRY.json`) :

```bash
python -m src.scripts.seed_media --revue-only
```

Le JSON généré est [`backend/data/MEDIA_REVUE_REGISTRY.json`](../backend/data/MEDIA_REVUE_REGISTRY.json).

## Flux RSS opinion (complément)

Le fichier [`backend/data/RSS_OPINION_SUPPLEMENT.json`](../backend/data/RSS_OPINION_SUPPLEMENT.json) ajoute des `rss_opinion_url` aux médias du CSV lors du `seed_media` (uniquement si l’URL n’est pas déjà renseignée). Les overrides par domaine et par `source_id` restent dans [`OPINION_HUB_OVERRIDES.json`](../backend/data/OPINION_HUB_OVERRIDES.json).
