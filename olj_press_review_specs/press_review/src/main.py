"""
OLJ Press Review — FastAPI Main Application
API server + scheduler for the press review system.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.config import get_settings
from src.models.database import init_db
from src.scheduler.daily_pipeline import create_scheduler, daily_pipeline
from src.collectors.rss_collector import run_collection
from src.processors.translator import run_translation_pipeline
from src.generators.press_review import PressReviewGenerator

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Initializing database...")
    await init_db()
    logger.info("Starting scheduler...")
    scheduler = create_scheduler()
    scheduler.start()
    app.state.scheduler = scheduler
    logger.info(f"OLJ Press Review ready (env={settings.environment})")
    yield
    scheduler.shutdown(wait=False)
    logger.info("Shutdown complete.")


app = FastAPI(
    title="OLJ Press Review API",
    description="Automated regional press review for L'Orient-Le Jour",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.environment}


@app.get("/status")
async def status():
    jobs = [
        {"id": j.id, "name": j.name, "next_run": str(j.next_run_time)}
        for j in app.state.scheduler.get_jobs()
    ]
    return {"status": "running", "jobs": jobs}


@app.post("/api/collect")
async def trigger_collect():
    try:
        return {"status": "ok", "stats": await run_collection()}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/translate")
async def trigger_translate():
    try:
        return {"status": "ok", "stats": await run_translation_pipeline()}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/pipeline")
async def trigger_pipeline():
    try:
        return {"status": "ok", "stats": await daily_pipeline()}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/generate")
async def generate_review(article_ids: list[str]):
    if not article_ids or len(article_ids) > 10:
        raise HTTPException(400, "Provide 1-10 article IDs")
    gen = PressReviewGenerator()
    text = await gen.generate_full_review(article_ids)
    return {"status": "ok", "review": text}


@app.get("/api/articles")
async def list_articles(status: str = "translated", limit: int = 50):
    from sqlalchemy import select
    from src.models.database import Article, get_session_factory
    sf = get_session_factory()
    async with sf() as db:
        result = await db.execute(
            select(Article)
            .where(Article.status == status)
            .order_by(Article.published_at.desc())
            .limit(limit)
        )
        articles = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "title_fr": a.title_fr,
            "title_original": a.title_original,
            "media_source_id": a.media_source_id,
            "author": a.author,
            "published_at": str(a.published_at) if a.published_at else None,
            "article_type": a.article_type,
            "source_language": a.source_language,
            "confidence": a.translation_confidence,
            "summary_fr": a.summary_fr,
        }
        for a in articles
    ]
