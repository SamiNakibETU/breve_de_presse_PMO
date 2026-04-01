# Pipeline retenu — collecte revue de presse OLJ

Ce dossier est la **version de référence** : uniquement le code **validé en production** pour extraire des articles d’opinion à partir du registre `MEDIA_REVUE_REGISTRY.json` (backend du projet). Le reste de l’historique d’essais se trouve sous `scraper/archive/`.

## Contenu

| Élément | Rôle |
|--------|------|
| `olj_revue/smart_content.py` | Extraction texte (Trafilatura + BeautifulSoup) et filtrage des URLs « article » (règles Haaretz, Israel Hayom, génériques). |
| `olj_revue/scrape_cascade.py` | Moteur `UltraScraperV3` : cascade HTTP → curl_cffi → Playwright → Selenium (fichier) → Scrapling ; découverte de liens sur les hubs ; cas Cloudflare ciblés. |
| `olj_revue/selenium_fetch_to_file.py` | Script invoqué en sous-processus : SeleniumBase UC écrit le HTML sur disque (évite la troncature stdout). |
| `olj_revue/harvest.py` | Orchestration : N articles par média, overrides de hubs locaux, repli `scrape(hub)` si besoin. |
| `olj_revue/__init__.py` | Exports publics du package. |
| `run_harvest.py` | Point d’entrée CLI. |
| `requirements.txt` | Dépendances minimales. |

## Prérequis

```bash
cd scraper/retenu_final
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

`seleniumbase` est requis pour les sites protégés par Cloudflare gérés dans le code (ex. Al-Watan). `scrapling` est optionnel (dernier recours dans la cascade).

## Utilisation

Depuis **`scraper/retenu_final`** :

```bash
python run_harvest.py
python run_harvest.py --articles 3 --min-words 120
python run_harvest.py --only il_israel_hayon --limit 1
python run_harvest.py --quiet
```

Chemins par défaut :

- Registre : `../../backend/data/MEDIA_REVUE_REGISTRY.json` (racine du dépôt `Projet_guerre`).
- Sortie : `../output/harvest/<timestamp_run>/` (sous `scraper/output/harvest/`).

Chaque média produit : `article_01.json` … `meta.json`. Le fichier `summary.json` résume le run.

Codes de sortie : `0` = tout OK, `2` = au moins un média en échec total, `3` = au moins un partiel (moins de N articles).

## Intégration backend (Python)

Ajouter `scraper/retenu_final` au `PYTHONPATH`, puis :

```python
import asyncio
from pathlib import Path
from olj_revue import run_full_harvest

registry = Path(".../backend/data/MEDIA_REVUE_REGISTRY.json")
out = Path(".../output/harvest")
summary = asyncio.run(run_full_harvest(registry, out, articles_target=3, min_article_words=120))
```

Ne pas modifier `generator.py`, `collector.py`, etc. du backend (règles projet) : ce module reste **standalone** ; l’intégration se fait par import ou appel subprocess vers `run_harvest.py`.

## Fichiers hors périmètre

- Anciens scrapers, tests et rapports : `scraper/archive/`.
- Doublon historique : `scraper/core/final/` peut rester pour compatibilité ; la **source de vérité** pour la suite est **`retenu_final/`**.

## Cadre légal

Respecter `robots.txt`, cadence des requêtes, autorisations institutionnelles et périmètre défini pour la revue de presse (registre médias validé OLJ). Ce code est un outil technique ; la conformité juridique relève du responsable du projet.
