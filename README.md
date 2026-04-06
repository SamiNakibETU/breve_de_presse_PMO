# Revue de presse régionale — L’Orient-Le Jour

Outil interne : **API FastAPI** + **application Next.js** pour la collecte, la traduction et le travail rédactionnel sur les articles d’opinion du périmètre médias validé par la rédaction.

**Production** : [revue-de-presse-olj.up.railway.app](https://revue-de-presse-olj.up.railway.app/)

## Contenu de ce dépôt

| Élément | Rôle |
|--------|------|
| `backend/` | API, jobs, accès PostgreSQL + pgvector |
| `frontend/` | Interface (français, Tailwind) |
| `docker-compose.yml` | PostgreSQL local pour le développement |
| `.github/workflows/` | CI (tests backend, lint / build / e2e frontend) |

La documentation produit, le design system détaillé, les scripts de scraper autonomes et les archives restent **en dehors du dépôt** (copie locale / outillage interne).

## Prérequis

Python **3.11+**, Node **20+** (idéalement **22** comme en CI), Docker si vous utilisez la base locale.

## Démarrage rapide

```bash
docker compose up -d
```

**Backend** (`backend/`) : créer un venv, `pip install -r requirements.txt`, copier `.env.example` → `.env`, puis `python -m src.scripts.seed_media` et lancer l’API (voir commentaires dans `.env.example`).

**Frontend** (`frontend/`) : `npm install`, copier `.env.example` → `.env.local`, `npm run dev`. Variables typiques : URL de l’API (`NEXT_PUBLIC_API_URL` ou mode proxy selon votre `.env.example`).

## Conventions (extrait)

- Ne pas modifier sans arbitrage : `generator.py`, `editorial_scope.py`, `llm_router.py`, `collector.py`.
- Migrations : **additives** uniquement (pas de `DROP` implicite en prod).
- UI : français ; Tailwind ; accent `#dd3b31`.

## Tests

```bash
cd backend && pytest tests/ -q
cd frontend && npm run lint && npm run typecheck && npm run build
```

Les workflows GitHub reprennent ces étapes sur push / PR.
