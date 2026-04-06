# Revue de presse régionale — L’Orient-Le Jour

Application **FastAPI** + **Next.js** : collecte, traduction et interface rédactionnelle pour les articles d’opinion du périmètre médias validé par la rédaction.

**En ligne** : [revue-de-presse-olj.up.railway.app](https://revue-de-presse-olj.up.railway.app/)

## Arborescence

| Dossier / fichier | Rôle |
|-------------------|------|
| `backend/` | API, tâches planifiées, PostgreSQL + pgvector |
| `frontend/` | Interface utilisateur (français, Tailwind) |
| `docker-compose.yml` | PostgreSQL pour le développement local |
| `.github/workflows/` | Intégration continue |

## Prérequis

Python 3.11+, Node.js 20+ (22 en CI), Docker si vous lancez la base via Compose.

## Installation locale

1. `docker compose up -d`
2. **Backend** : `cd backend` → venv → `pip install -r requirements.txt` → copier `.env.example` vers `.env` → `python -m src.scripts.seed_media` → démarrer l’API (voir `.env.example`).
3. **Frontend** : `cd frontend` → `npm install` → copier `.env.example` vers `.env.local` → `npm run dev` (URL de l’API selon `.env.example`).

## Règles de contribution

- Fichiers non modifiables sans validation métier : `generator.py`, `editorial_scope.py`, `llm_router.py`, `collector.py`.
- Migrations : uniquement additives ; pas de suppression de colonnes/tables en production sans procédure dédiée.
- Interface : textes en français ; Tailwind ; accent `#dd3b31`.

## Qualité

```bash
cd backend && pytest tests/ -q
cd frontend && npm run lint && npm run typecheck && npm run build
```
