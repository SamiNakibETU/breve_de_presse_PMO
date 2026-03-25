from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.config import get_settings


@lru_cache()
def get_engine() -> AsyncEngine:
    settings = get_settings()
    return create_async_engine(
        settings.async_database_url,
        echo=(settings.environment == "development"),
        pool_size=10,
        max_overflow=5,
    )


@lru_cache()
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        get_engine(),
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        yield session


async def init_db() -> None:
    import structlog
    from sqlalchemy import text

    from src.models import Base

    log = structlog.get_logger(__name__)
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        for stmt in [
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS embedding vector(1024)",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES topic_clusters(id)",
            "ALTER TABLE media_sources ADD COLUMN IF NOT EXISTS rss_opinion_url VARCHAR(500)",
            "ALTER TABLE media_sources ADD COLUMN IF NOT EXISTS opinion_hub_urls_json TEXT",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS translation_failure_count INTEGER DEFAULT 0",
            # Santé sources (aligné Alembic 20260325) — évite 500 si migrations non jouées (ex. Railway)
            "ALTER TABLE media_sources ADD COLUMN IF NOT EXISTS health_status VARCHAR(20)",
            (
                "ALTER TABLE media_sources ADD COLUMN IF NOT EXISTS "
                "consecutive_empty_collection_runs INTEGER NOT NULL DEFAULT 0"
            ),
            (
                "ALTER TABLE media_sources ADD COLUMN IF NOT EXISTS "
                "last_article_ingested_at TIMESTAMP WITH TIME ZONE"
            ),
            "ALTER TABLE media_sources ADD COLUMN IF NOT EXISTS health_metrics_json JSONB",
            "ALTER TABLE collection_logs ADD COLUMN IF NOT EXISTS duration_seconds INTEGER",
            "ALTER TABLE collection_logs ADD COLUMN IF NOT EXISTS articles_filtered INTEGER",
            (
                "ALTER TABLE collection_logs ADD COLUMN IF NOT EXISTS "
                "extraction_attempts INTEGER NOT NULL DEFAULT 0"
            ),
            (
                "ALTER TABLE collection_logs ADD COLUMN IF NOT EXISTS "
                "extraction_primary_success INTEGER NOT NULL DEFAULT 0"
            ),
            # Articles MEMW / clustering (Alembic 20260324–20260328) — évite 500 sur /health, /clusters/…/articles
            (
                "ALTER TABLE articles ADD COLUMN IF NOT EXISTS "
                "cluster_soft_assigned BOOLEAN NOT NULL DEFAULT false"
            ),
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS framing_json JSON",
            (
                "ALTER TABLE articles ADD COLUMN IF NOT EXISTS "
                "is_syndicated BOOLEAN NOT NULL DEFAULT false"
            ),
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS canonical_article_id UUID",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS framing_actor VARCHAR(500)",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS framing_tone VARCHAR(120)",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS framing_prescription TEXT",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_translated_fr TEXT",
            (
                "ALTER TABLE articles ADD COLUMN IF NOT EXISTS "
                "en_translation_summary_only BOOLEAN NOT NULL DEFAULT false"
            ),
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS edition_id UUID",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_score DOUBLE PRECISION",
            (
                "ALTER TABLE articles ADD COLUMN IF NOT EXISTS "
                "relevance_score_deterministic DOUBLE PRECISION"
            ),
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS syndication_group_size INTEGER",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS syndication_group_sources JSON",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_band VARCHAR(32)",
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS translation_quality_flags JSON",
            "ALTER TABLE llm_call_logs ADD COLUMN IF NOT EXISTS provider VARCHAR(32)",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception as exc:
                log.warning(
                    "init_db.alter_skipped",
                    snippet=stmt[:72],
                    error=str(exc)[:160],
                )
        for idx_stmt in [
            "CREATE INDEX IF NOT EXISTS ix_articles_status_collected_at ON articles (status, collected_at)",
            "CREATE INDEX IF NOT EXISTS ix_articles_translation_failure_count ON articles (translation_failure_count)",
            "CREATE INDEX IF NOT EXISTS ix_pipeline_jobs_status_created_at ON pipeline_jobs (status, created_at)",
            (
                "CREATE INDEX IF NOT EXISTS ix_pipeline_debug_logs_step_created_at "
                "ON pipeline_debug_logs (step, created_at DESC)"
            ),
        ]:
            try:
                await conn.execute(text(idx_stmt))
            except Exception:
                pass

    try:
        from src.services.pipeline_execution_lease import ensure_lease_table_row

        await ensure_lease_table_row()
    except Exception as exc:
        log.warning("init_db.lease_seed_failed", error=str(exc)[:160])
