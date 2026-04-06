# Revue de presse régionale — L’Orient-Le Jour

Application web de **collecte**, **traduction** et **sélection éditoriale** d’articles d’opinion et d’analyse issus d’un périmètre médias validé par la rédaction OLJ.

**Déploiement (exemple)** : [revue-de-presse-olj.up.railway.app](https://revue-de-presse-olj.up.railway.app/)

## Périmètre du dépôt

| Dossier | Rôle |
|--------|------|
| `backend/` | API FastAPI, base PostgreSQL + pgvector, jobs pipeline |
| `frontend/` | Interface Next.js (UI en français) |
| `docs/` | Documentation produit et technique essentielle |
| `DESIGN_SYSTEM/` | Fondations UI (tokens, composants, patterns) |
| `scraper/` | Outils et configuration de collecte complémentaires (hors build Railway front/back) |

## Architecture technique

```
backend/    Python 3.11+ / FastAPI / SQLAlchemy async / PostgreSQL + pgvector
frontend/   Next.js 15 / React 19 / Tailwind CSS / TypeScript
```

**Chaîne métier (résumé)** : ingestion des contenus → traduction et enrichissement → clustering / sujets → interface rédactionnelle (édition du jour, articles, régie) → export vers le CMS.

## Prérequis

- Python 3.11+
- Node.js 20+
- Docker (PostgreSQL local)
- Clés API selon votre `.env` (ex. fournisseurs LLM configurés dans le projet)

## Installation

### 1. Base de données

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Renseigner les variables requises (voir commentaires dans .env.example)
```

### 3. Initialiser la BDD et les sources médias

```bash
cd backend
python -m src.scripts.seed_media
```

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
```

## Lancement local

**Backend** (port 8000) :

```bash
cd backend
uvicorn src.app:app --reload --port 8000
```

**Frontend** (port 3000) :

```bash
cd frontend
npm run dev
```

Ouvrir `http://localhost:3000`.

## Conventions dépôt

- **Fichiers gelés côté métier** (ne pas modifier sans arbitrage explicite) : `generator.py`, `editorial_scope.py`, `llm_router.py`, `collector.py`.
- **Migrations Alembic** : uniquement **additives** (pas de `DROP` de colonnes/tables en production sans procédure dédiée).
- **UI** : français ; **Tailwind** uniquement ; accent éditorial `#dd3b31` (tokens `--color-accent` / `accent`).

## Documentation

- Index : [`docs/README.md`](docs/README.md)
- Backlog / diagnostic pipeline : [`docs/plan.md`](docs/plan.md)
- Décisions produit synthétiques : [`docs/DECISIONS_PO.md`](docs/DECISIONS_PO.md)
- Périmètre légal / technique de la collecte : [`docs/MEMW_LEGITIMATE_SCRAPING_SCOPE.md`](docs/MEMW_LEGITIMATE_SCRAPING_SCOPE.md)

## Vérification des hubs (équipe technique)

Depuis `backend/` (venv activé ; `python -m playwright install chromium` si besoin) :

- Hubs + échantillon d’article : `python -m src.scripts.validate_media_hubs`
- Plusieurs articles par média : `python -m src.scripts.verify_opinion_hub_content --per-source 3 --max-media 10`
- Overrides flux / sélecteurs : `backend/data/OPINION_HUB_OVERRIDES.json`

## Tests

```bash
cd backend
pytest tests/ -v
```

## API (aperçu)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Santé de l’API |
| `/api/status` | GET | Scheduler et jobs |
| `/api/stats` | GET | Métriques récentes |
| `/api/articles` | GET | Liste articles (filtres) |
| `/api/articles/{id}` | GET | Détail article |
| `/api/media-sources` | GET | Sources médias |
| `/api/collect` | POST | Lancer la collecte |
| `/api/translate` | POST | Lancer la traduction |
| `/api/pipeline` | POST | Pipeline complet |
| `/api/reviews/generate` | POST | Générer une revue (`{ "article_ids": [...] }`) |
| `/api/reviews` | GET | Historique des revues |

La liste complète des routes métier est dans le code FastAPI (`backend/src`).
