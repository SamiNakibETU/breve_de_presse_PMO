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
    from sqlalchemy import text

    from src.models import Base

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
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
        for idx_stmt in [
            "CREATE INDEX IF NOT EXISTS ix_articles_status_collected_at ON articles (status, collected_at)",
            "CREATE INDEX IF NOT EXISTS ix_articles_translation_failure_count ON articles (translation_failure_count)",
            "CREATE INDEX IF NOT EXISTS ix_pipeline_jobs_status_created_at ON pipeline_jobs (status, created_at)",
        ]:
            try:
                await conn.execute(text(idx_stmt))
            except Exception:
                pass
