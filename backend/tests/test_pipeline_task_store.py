"""Stockage des tâches pipeline (PostgreSQL / SQLite en test)."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models.pipeline_job import PipelineJob
from src.schemas.pipeline import PipelineTaskKind, PipelineTaskStartRequest
from src.services import pipeline_task_store as store


@pytest.fixture
async def pipeline_jobs_engine():
    """SQLite minimal : seulement `pipeline_jobs` (évite ARRAY/vector du schéma complet)."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(PipelineJob.__table__.create)
    yield engine
    await engine.dispose()


@pytest.fixture
async def pipeline_store_sqlite(pipeline_jobs_engine):
    factory = async_sessionmaker(
        pipeline_jobs_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    store.configure_session_factory(factory)
    yield
    store.configure_session_factory(None)


@pytest.mark.asyncio
async def test_create_and_get_task(pipeline_store_sqlite):
    tid = await store.create_task("collect")
    assert tid
    t = await store.get_task(tid)
    assert t is not None
    assert t["task_id"] == tid
    assert t["kind"] == "collect"
    assert t["status"] == "pending"
    assert t["step_key"] == "queued"


@pytest.mark.asyncio
async def test_update_step_and_finish_ok(pipeline_store_sqlite):
    tid = await store.create_task("translate")
    await store.update_step(tid, "llm", "Traduction…")
    t = await store.get_task(tid)
    assert t is not None
    assert t["status"] == "running"
    assert t["step_label"] == "Traduction…"

    await store.finish_ok(tid, {"status": "ok", "stats": {"processed": 1}})
    t2 = await store.get_task(tid)
    assert t2 is not None
    assert t2["status"] == "done"
    assert t2["result"] == {"status": "ok", "stats": {"processed": 1}}


@pytest.mark.asyncio
async def test_finish_error(pipeline_store_sqlite):
    tid = await store.create_task("full_pipeline")
    await store.finish_error(tid, "boom")
    t = await store.get_task(tid)
    assert t is not None
    assert t["status"] == "error"
    assert t["error"] == "boom"


@pytest.mark.asyncio
async def test_get_missing_returns_none(pipeline_store_sqlite):
    assert await store.get_task("00000000-0000-0000-0000-000000000000") is None


def test_pipeline_task_start_request_defaults():
    r = PipelineTaskStartRequest(kind=PipelineTaskKind.collect)
    assert r.kind == PipelineTaskKind.collect
    assert r.translate_limit is None


def test_pipeline_task_start_request_translate_limit():
    r = PipelineTaskStartRequest(kind=PipelineTaskKind.translate, translate_limit=50)
    assert r.translate_limit == 50


@pytest.mark.asyncio
async def test_execute_pipeline_task_dispatches_collect(monkeypatch):
    captured: list[str] = []

    async def fake_collect(task_id: str) -> None:
        captured.append(task_id)

    monkeypatch.setattr(
        "src.services.pipeline_async_jobs.execute_collect_task",
        fake_collect,
    )
    from src.services.pipeline_async_jobs import execute_pipeline_task

    await execute_pipeline_task("abc", "collect", 300)
    assert captured == ["abc"]


@pytest.mark.asyncio
async def test_execute_pipeline_task_unknown_kind(pipeline_store_sqlite):
    tid = await store.create_task("collect")
    from src.services.pipeline_async_jobs import execute_pipeline_task

    await execute_pipeline_task(tid, "not_a_real_kind", 300)
    t = await store.get_task(tid)
    assert t is not None
    assert t["status"] == "error"
    assert "inconnu" in (t.get("error") or "").lower()
