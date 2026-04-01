# Scraper standalone — veille médias (recherche académique)

Outil **autonome** pour la collecte de contenu médiatique dans le cadre de projets de recherche universitaire.

## Pipeline final (production)

**Source de vérité :** dossier **`retenu_final/`** (README détaillé : `retenu_final/README.md`).

- **3 articles par média** depuis `backend/data/MEDIA_REVUE_REGISTRY.json` :
  ```bash
  cd scraper/retenu_final
  python run_harvest.py
  ```
  ou depuis `scraper/` : `python run_harvest.py` (délègue vers `retenu_final`).
- Sortie : `output/harvest/<timestamp>/<media_id>/article_01.json` … + `summary.json`.
- Options : `--articles 3`, `--min-words 120`, `--only <media_id>`, `--limit N`, `--quiet`.

⚠️ **Important**: Les médias ciblés disposent de protections anti-bot sophistiquées. L'approche recommandée est la **collecte manuelle des URLs** suivie d'un scraping ciblé.

---

## Installation

```bash
cd scraper
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
playwright install chromium
```

---

## Problème: Détection Anti-Bot

L'**Itération 1** (test sur 5 médias) a révélé que tous les sites testés bloquent les navigateurs automatisés:

| Média | Protection | Résultat |
|-------|-----------|----------|
| The National | 404 Not Found | ❌ |
| Gulf News | 404 + Cookie Consent | ❌ |
| Al-Ittihad | Contenu protégé/short | ❌ |

**Cause**: Détection de `navigator.webdriver`, fingerprinting canvas/fonts, TLS fingerprinting.

### Solutions Possibles

1. **URLs Manuelles (Recommandé)** ⭐
   - Collecte manuelle via navigateur normal
   - Scraping ciblé article par article
   - Respect des CGU, contournement naturel

2. **Services API Payants**
   - ScrapingBee, ScraperAPI, Bright Data
   - Proxies résidentiels avec rotation
   - Coût: ~$50-200/mois

3. **Vrais Navigateurs (Selenium Grid)**
   - Chrome/Firefox non-headless
   - Infrastructure complexe et coûteuse

---

## Scripts Disponibles

### 1. Scraper par URLs Manuelles (RECOMMANDÉ)

**Workflow recommandé pour recherche académique:**

1. **Collecter manuellement** 3 URLs d'articles par média depuis votre navigateur
2. **Créer un fichier URLs** (une URL par ligne)
3. **Lancer le scraping ciblé**

```bash
# Créer fichier urls.txt avec les URLs collectées
python scripts/scrape_from_urls.py --urls urls.txt --batch mon_media

# Ou passer URLs directement
python scripts/scrape_from_urls.py --batch ae_the_national \
  --url-list \
  "https://www.thenationalnews.com/opinion/comment/2024/01/15/article-1/" \
  "https://www.thenationalnews.com/opinion/comment/2024/01/14/article-2/" \
  "https://www.thenationalnews.com/opinion/comment/2024/01/13/article-3/"
```

**Avantage**: Contournement complet des protections anti-bot car les URLs sont collectées via navigation humaine.

### 2. Scraper Itératif avec Diagnostics

Pour tests et analyse automatique des protections:

```bash
# Une itération sur 5 médias avec logs détaillés
python scripts/iterative_batch_scraper.py --batch-size 5 --one-iteration

# Campagne complète (tous les médias)
python scripts/iterative_batch_scraper.py --batch-size 5 --max-iterations 20
```

**Fichiers générés**:
- `output/iterations/iteration_N_*.json` — Résultats par itération
- `output/iterations/scraping_log_*.jsonl` — Logs ultra-détaillés
- `output/iterations/scraping_report_*.json` — Rapport de synthèse

### 3. Debug et Analyse HTML

Pour comprendre pourquoi un site bloque:

```bash
# Analyser une URL spécifique
python scripts/debug_fetch_and_analyze.py

# Analyser un fichier HTML sauvegardé
python scripts/analyze_html_file.py output/debug_samples/fichier.html
```

---

## Configuration

### `config/scraping_config.yaml`

```yaml
http:
  timeout_seconds: 45
  max_attempts: 4

playwright:
  headless: true
  wait_ms: 5000
  scroll_on_article: true
  block_heavy_assets: true

wayback:
  enabled: true
  timeout_seconds: 60
```

### `config/site_selectors.json`

Sélecteurs CSS optionnels par média (fallback sur Trafilatura si absent):

```json
{
  "sites": [
    {
      "media_id": "ae_the_national",
      "hosts": ["thenationalnews.com"],
      "selectors": {
        "title": ["h1.headline", "article h1"],
        "body": ["article .article-body", ".wysiwyg"],
        "author": [".byline a", "[data-testid='author-name']"],
        "date": ["time[datetime]"]
      }
    }
  ]
}
```

---

## Chaîne d'Extraction

Pour chaque URL, le scraper essaie successivement:

1. **HTTP** (`aiohttp` / `curl_cffi`) — requête directe
2. **Wayback Machine** — snapshot archivée
3. **Playwright Enhanced** — navigateur avec anti-détection + gestion cookies

Si le HTML est récupéré:
- Extraction **site-spécifique** (sélecteurs CSS configurés)
- Extraction **Trafilatura** (fallback générique)
- Validation qualité (longueur, paywall detection)

---

## Output Format

```json
{
  "metadata": {
    "export_date": "2024-01-15T10:30:00Z",
    "total_attempts": 3,
    "successful_extractions": 2,
    "failed_extractions": 1,
    "success_rate": 0.67
  },
  "articles": [
    {
      "url": "https://...",
      "title": "Article Title",
      "body": "Full article text...",
      "author": "John Doe",
      "published_date": "2024-01-10",
      "extraction_method": "playwright_enhanced",
      "word_count": 1250
    }
  ],
  "failed": [
    {
      "url": "https://...",
      "error": "error_page_404"
    }
  ]
}
```

---

## Rapports et Logs

### Rapport Itération 1

📄 `output/RAPPORT_ITERATION_1.md`

Analyse complète des échecs, root causes, et recommandations.

### Logs JSONL

Chaque opération est loguée avec:
- Timestamp précis
- Stratégie utilisée
- Codes erreur détaillés
- Analyse HTML (cloudflare, captcha, paywall)
- Recommandations

---

## Cadre Légal et Éthique

Cet outil est conçu pour la **recherche académique** dans le cadre de:

- Exception pour recherche (droit d'auteur)
- Analyse sémantique agrégée (non redistribution)
- Respect des `robots.txt`
- Rate limiting configurable

**Conseil**: Toujours vérifier avec le service juridique de votre institution.

---

## Structure du Projet

```
scraper/
├── config/
│   ├── scraping_config.yaml      # Paramètres généraux
│   ├── site_selectors.json        # Sélecteurs CSS par média
│   └── media_registry.json        # Registre 74 médias
├── core/
│   ├── fetcher.py                 # HTTP multi-stratégie
│   ├── browser.py                 # Playwright standard
│   ├── enhanced_browser.py        # Playwright avec anti-détection
│   ├── wayback.py                 # Wayback Machine
│   ├── diagnostics.py             # Analyse HTML structure
│   ├── logger.py                  # Logging ultra-précis
│   ├── extractor.py               # Orchestration extraction
│   └── link_discovery.py          # Extraction liens hubs
├── extractors/
│   └── site_specific.py            # Extraction sélecteurs CSS
├── quality/
│   └── article_validator.py       # Validation qualité
├── exporters/
│   └── json_exporter.py           # Export JSON structuré
└── scripts/
    ├── scrape_from_urls.py         # ⭐ RECOMMANDÉ: URLs manuelles
    ├── iterative_batch_scraper.py  # Itérations avec diagnostics
    ├── debug_fetch_and_analyze.py  # Debug/analyse
    └── analyze_html_file.py        # Analyse HTML sauvegardé
```

---

## Modules Créés

### Diagnostics (`core/diagnostics.py`)

Analyse approfondie du HTML:
- Détection Cloudflare, Captcha, Paywall
- Détection SPA (React/Vue/Angular)
- Comptage liens (article vs navigation)
- Extraction JSON-LD, Meta tags
- Génération de recommandations

### Logger (`core/logger.py`)

Logging ultra-précis:
- Entrées JSONL timestampées
- Statistiques agrégées
- Rapports automatiques
- Suivi par itération/média

### Enhanced Browser (`core/enhanced_browser.py`)

Playwright amélioré:
- Anti-détection avancée
- Gestion cookie consent dialogs
- Détection pages d'erreur
- Scrolling automatique

---

## Support et Limites

### Limites Connues

- **Taux de succès <100%** avec approche automatique (anti-bot)
- Paywalls avec authentification: non contournables
- Géoblocage: nécessite proxies
- Absence Wayback: certains articles récents non archivés

### Recommandation Finale

Pour un projet de recherche académique avec **74 médias** et objectif **100% succès**:

> **Utiliser l'approche URLs manuelles**: collecter 3 URLs par média via navigation normale, puis `scrape_from_urls.py`.

Cette approche:
- ✅ Contourne toutes les protections anti-bot
- ✅ Respecte les CGU des sites
- ✅ Donne un contrôle total sur les articles collectés
- ✅ Permet de cibler rubriques/opinion spécifiques
- ✅ Est éthiquement et légalement sûre

---

## Contact

Pour questions sur l'architecture ou améliorations: consulter la documentation dans `docs/` du projet principal.
