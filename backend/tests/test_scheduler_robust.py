"""Tests verrous / budgets pipeline (mocks, sans Postgres)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from src.services.scheduler import (
    PipelineStepTimeout,
    _run_step_budget,
    pipeline_is_busy_async,
)


@pytest.mark.asyncio
async def test_run_step_budget_zero_runs_factory() -> None:
    async def factory() -> str:
        return "ok"

    out = await _run_step_budget("x", "t", 0, factory)
    assert out == "ok"


@pytest.mark.asyncio
async def test_run_step_budget_timeout_raises() -> None:
    async def slow() -> str:
        await asyncio.sleep(10.0)
        return "no"

    with (
        patch(
            "src.services.scheduler.resolve_current_edition_id",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch("src.services.scheduler.log_pipeline_step", new_callable=AsyncMock),
        patch(
            "src.services.alerts.post_pipeline_step_timeout_alert",
            new_callable=AsyncMock,
        ),
    ):
        with pytest.raises(PipelineStepTimeout):
            await _run_step_budget("collect", "test", 1, slow)


@pytest.mark.asyncio
async def test_pipeline_is_busy_async_true_when_lock_held() -> None:
    from src.services import scheduler as sched_mod

    lock = sched_mod._pipeline_lock
    await lock.acquire()
    try:
        busy = await pipeline_is_busy_async()
        assert busy is True
    finally:
        lock.release()


@pytest.mark.asyncio
async def test_pipeline_is_busy_async_checks_lease_when_unlocked() -> None:
    with patch(
        "src.services.pipeline_execution_lease.is_daily_pipeline_lease_held_alive",
        new_callable=AsyncMock,
        return_value=True,
    ):
        busy = await pipeline_is_busy_async()
        assert busy is True
