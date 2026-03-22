# Fichiers canoniques MEMW (alignement v3)

## Spécification

- **Canonique** : [`MEMW_SPEC_FINALE_v3.md`](../MEMW_SPEC_FINALE_v3.md) — version de référence pour les sprints et la recette.
- **Doublon** : `MEMW_SPEC_FINALE_v3 (1).md` — contenu différent (taille et hash) ; ne pas éditer les deux en parallèle. Toute évolution de spec doit partir du fichier canonique ci-dessus.

## Liste sources Emilie (CSV)

- **Canonique pour l’import** : [`media revue - Sheet1.csv`](../media%20revue%20-%20Sheet1.csv) — chemin par défaut de [`import_media_revue_csv`](../backend/src/scripts/import_media_revue_csv.py).
- **Variante** : `media revue - Sheet1 (1).csv` — binaire différent du canonique. **Fusion recommandée** : comparer les deux fichiers (diff ou outil de tableur), reporter dans `media revue - Sheet1.csv` toute ligne absente du canonique, puis `python -m src.scripts.import_media_revue_csv` depuis `backend/`. Ne pas maintenir deux imports parallèles.

## Registres générés

- [`backend/data/MEDIA_REVUE_REGISTRY.json`](../backend/data/MEDIA_REVUE_REGISTRY.json) — produit par l’import CSV.
- [`backend/data/MEDIA_REGISTRY.json`](../backend/data/MEDIA_REGISTRY.json) — base OLJ ; fusion au seed avec la revue (même `id` : la revue surcharge les champs).

## Tiers éditoriaux

- [`backend/data/MEDIA_TIER_OVERRIDES.json`](../backend/data/MEDIA_TIER_OVERRIDES.json) — surcharge optionnelle `id → 0|1|2` (P0–P2).
