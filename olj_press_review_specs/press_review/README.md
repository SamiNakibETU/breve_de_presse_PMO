# OLJ Press Review

Automated regional press review system for L'Orient-Le Jour.

## Setup

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in API keys and DATABASE_URL
```

## Database

```bash
psql $DATABASE_URL -f DATABASE_SCHEMA.sql
python -m src.scripts.seed_media  # Insert 48 media sources
```

## Run

```bash
# API + Scheduler
uvicorn src.main:app --reload --port 8000

# Streamlit Interface
streamlit run interface/app.py --server.port 8501

# Manual pipeline run
python -m src.scheduler.daily_pipeline
```

## Deploy (Railway)

```bash
railway login && railway up
```

See `RAILWAY_DEPLOYMENT.md` for full instructions.
