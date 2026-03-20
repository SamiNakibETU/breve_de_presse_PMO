# Liste « media revue » (CSV → base → collecte)

## 1. Fichier source

Feuille **`media revue - Sheet1.csv`** à la racine du repo (colonnes : Pays, nom, langue, url, catégories = URLs d’opinion, notes).

## 2. Générer le registre JSON

Depuis `backend/` :

```bash
python -m src.scripts.import_media_revue_csv "../media revue - Sheet1.csv"
```

Sortie : **`backend/data/MEDIA_REVUE_REGISTRY.json`** (~66 médias avec `opinion_hub_urls` + `collection_method: opinion_hub`).

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

## 6. Faire évoluer la liste

1. Modifier le CSV.
2. Relancer `import_media_revue_csv`.
3. Relancer `seed_media`.
4. Redémarrer l’API si besoin.
