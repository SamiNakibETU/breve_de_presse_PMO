# CURSOR_AGENT_INSTRUCTIONS.md
## Instructions pour l'agent Claude Opus 4.6 dans Cursor

---

## 1. VUE D'ENSEMBLE

Tu construis un système automatisé de revue de presse régionale pour L'Orient-Le Jour (OLJ), quotidien francophone libanais. Le système collecte quotidiennement des articles d'opinion/analyse de 48 médias MENA, les traduit et résume en français, et permet à un journaliste de sélectionner 3-5 articles pour générer une revue de presse formatée prête pour le CMS.

## 2. DOCUMENTS DE RÉFÉRENCE — ORDRE DE LECTURE

1. **MASTER_SPECIFICATION.md** — Spécification complète (Steps 1-7)
2. **DATABASE_SCHEMA.sql** — Schéma PostgreSQL à exécuter
3. **MEDIA_REGISTRY.json** — 48 médias annotés
4. **IMPLEMENTATION_ROADMAP.md** — Plan sprint par sprint
5. **RAILWAY_DEPLOYMENT.md** — Guide déploiement
6. **PROMPTS_LIBRARY.md** — Tous les prompts LLM

## 3. STACK TECHNIQUE

- Python 3.11+ / FastAPI 0.115.6 / SQLAlchemy 2.0 async + asyncpg
- PostgreSQL 16 + pgvector 0.7+ / Alembic migrations
- Anthropic SDK 0.42.0 (Claude Haiku 4.5 + Sonnet 4.5)
- feedparser 6.0 / trafilatura 2.0 / APScheduler 3.10
- Streamlit 1.41 (interface) / Railway (deployment)

## 4. ORDRE D'IMPLÉMENTATION

### Sprint 1 : Fondations (3j)
1. Structure du projet + `pip install -r requirements.txt`
2. `.env` depuis `.env.example` + DATABASE_SCHEMA.sql sur PostgreSQL
3. Script `seed_media.py` → MEDIA_REGISTRY.json en BDD
4. `rss_collector.py` — tester sur 5 sources (ToI, AJ, ArabNews, Al-Monitor, OrientXXI)
- **Validation** : `pytest tests/test_collectors.py` passe, articles dédupliqués en BDD

### Sprint 2 : Pipeline LLM (3j)
1. `translator.py` — traduction+résumé via Haiku 4.5, tester sur 10 articles
2. `press_review.py` — génération format OLJ via Sonnet 4.5
- **Validation** : Résumés 150-200 mots, format OLJ exact, confidence scores

### Sprint 3 : Interface (2j)
1. `interface/app.py` Streamlit — filtres, sélection, génération, copie
- **Validation** : Workflow journaliste complet fonctionnel

### Sprint 4 : Intégration (2j)
1. `src/main.py` FastAPI + scheduler APScheduler
2. Pipeline bout-en-bout + tests intégration
- **Validation** : Pipeline automatique < 15 min

### Sprint 5 : Déploiement (2j)
1. Railway : PostgreSQL + pgvector + FastAPI + Streamlit
- **Validation** : Système opérationnel en production

## 5. CONVENTIONS

- Async partout pour I/O
- Type hints obligatoires
- `tenacity` pour retry sur appels API
- Logging structuré via `structlog`
- Tests : un fichier par module, mocker les appels Anthropic
- snake_case (fichiers, vars, fonctions), PascalCase (classes)
- Docstrings Google style en anglais, documentation en français

## 6. GESTION DES CAS LIMITES

| Problème | Solution |
|----------|----------|
| RSS URL invalide | → collection_method: scraping + trafilatura |
| Article < 200 chars | → Ignorer |
| Langue non détectée | → Utiliser langue principale source |
| JSON invalide du LLM | → Retry 3x + fallback regex |
| Paywall | → Titre + chapeau seulement, flagger |
| Rate limit API | → Backoff exponentiel tenacity |

## 7. COMMANDES

```bash
cp .env.example .env && pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
streamlit run interface/app.py --server.port 8501
pytest tests/ -v
python -m src.scheduler.daily_pipeline  # Pipeline manuel
railway up  # Déploiement
```
