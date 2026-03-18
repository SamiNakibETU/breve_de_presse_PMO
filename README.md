# OLJ Press Review — Revue de Presse Régionale Automatisée

Système de collecte, traduction et mise en forme d'articles d'opinion/analyse provenant de 48 médias du Moyen-Orient pour L'Orient-Le Jour.

## Architecture

```
backend/    Python 3.11+ / FastAPI / SQLAlchemy async / PostgreSQL + pgvector
frontend/   Next.js 15 / React 19 / Tailwind CSS / TypeScript
```

**Pipeline quotidien :** collecte RSS (feedparser + trafilatura) → traduction + résumé (Claude Haiku 4.5) → extraction d'entités → sélection éditoriale (interface web) → génération format OLJ (Claude Sonnet 4.5) → copier-coller CMS.

## Prérequis

- Python 3.11+
- Node.js 20+
- Docker (pour PostgreSQL)
- Clé API Anthropic

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
# Remplir ANTHROPIC_API_KEY dans .env
```

### 3. Initialiser la BDD et les sources

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

## Lancement

### Backend (port 8000)

```bash
cd backend
uvicorn src.app:app --reload --port 8000
```

### Frontend (port 3000)

```bash
cd frontend
npm run dev
```

Ouvrir http://localhost:3000

## Workflow journaliste

1. Le pipeline collecte et traduit automatiquement à 06h00 et 14h00 UTC
2. Le journaliste consulte le Dashboard et parcourt les Articles
3. Il sélectionne 3 à 5 articles et clique « Générer la revue »
4. Il copie le texte formaté OLJ et le colle dans le CMS
5. Relecture et publication manuelle

## API

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Status de l'API |
| `/api/status` | GET | Status scheduler + jobs |
| `/api/stats` | GET | Métriques 24h |
| `/api/articles` | GET | Liste articles (filtres: status, country, article_type, language, min_confidence) |
| `/api/articles/{id}` | GET | Détail article |
| `/api/media-sources` | GET | Liste des 48 sources |
| `/api/collect` | POST | Lancer la collecte RSS |
| `/api/translate` | POST | Lancer la traduction |
| `/api/pipeline` | POST | Pipeline complet (collecte + traduction) |
| `/api/reviews/generate` | POST | Générer revue de presse (body: `{article_ids: [...]}`) |
| `/api/reviews` | GET | Historique des revues |

## Tests

```bash
cd backend
pytest tests/ -v
```

## Specs

Les spécifications complètes sont dans `olj_press_review_specs/`.