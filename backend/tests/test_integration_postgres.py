"""
Intégration Postgres réelle via Testcontainers (Docker).

Lancer : ``RUN_INTEGRATION=1 pytest tests/test_integration_postgres.py -q``
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models.pipeline_job import PipelineJob
from src.services import pipeline_task_store as store

if os.getenv("RUN_INTEGRATION") != "1":
    pytest.skip(
        "Tests d’intégration Docker : définir RUN_INTEGRATION=1",
        allow_module_level=True,
    )


@pytest.fixture(scope="module")
def postgres_async_url() -> str:
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("postgres:16-alpine") as pg:
        sync_url = pg.get_connection_url()
        yield sync_url.replace("postgresql://", "postgresql+asyncpg://", 1)


@pytest.mark.asyncio
async def test_pipeline_task_store_on_postgres(postgres_async_url: str):
    engine = create_async_engine(postgres_async_url)
    async with engine.begin() as conn:
        await conn.run_sync(PipelineJob.__table__.create)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    store.configure_session_factory(factory)
    try:
        tid = await store.create_task("collect")
        assert tid
        row = await store.get_task(tid)
        assert row is not None
        assert row["kind"] == "collect"
        await store.finish_ok(tid, {"ok": True})
        done = await store.get_task(tid)
        assert done is not None
        assert done["status"] == "done"
    finally:
        store.configure_session_factory(None)
        await engine.dispose()
