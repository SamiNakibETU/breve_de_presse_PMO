"""Stockage des tâches pipeline (mémoire) et schéma de démarrage."""

import pytest

from src.schemas.pipeline import PipelineTaskKind, PipelineTaskStartRequest
from src.services import pipeline_task_store as store


def test_create_and_get_task():
    tid = store.create_task("collect")
    assert tid
    t = store.get_task(tid)
    assert t is not None
    assert t["task_id"] == tid
    assert t["kind"] == "collect"
    assert t["status"] == "pending"
    assert t["step_key"] == "queued"


def test_update_step_and_finish_ok():
    tid = store.create_task("translate")
    store.update_step(tid, "llm", "Traduction…")
    t = store.get_task(tid)
    assert t["status"] == "running"
    assert t["step_label"] == "Traduction…"

    store.finish_ok(tid, {"status": "ok", "stats": {"processed": 1}})
    t2 = store.get_task(tid)
    assert t2["status"] == "done"
    assert t2["result"] == {"status": "ok", "stats": {"processed": 1}}


def test_finish_error():
    tid = store.create_task("full_pipeline")
    store.finish_error(tid, "boom")
    t = store.get_task(tid)
    assert t["status"] == "error"
    assert t["error"] == "boom"


def test_get_missing_returns_none():
    assert store.get_task("00000000-0000-0000-0000-000000000000") is None


def test_pipeline_task_start_request_defaults():
    r = PipelineTaskStartRequest(kind=PipelineTaskKind.collect)
    assert r.kind == PipelineTaskKind.collect
    assert r.translate_limit == 300


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
async def test_execute_pipeline_task_unknown_kind():
    tid = store.create_task("collect")
    from src.services.pipeline_async_jobs import execute_pipeline_task

    await execute_pipeline_task(tid, "not_a_real_kind", 300)
    t = store.get_task(tid)
    assert t is not None
    assert t["status"] == "error"
    assert "inconnu" in (t.get("error") or "").lower()
