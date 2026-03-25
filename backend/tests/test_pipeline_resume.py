"""Tests ciblés pour la reprise pipeline (fenêtre retry + snapshot)."""

from __future__ import annotations

import uuid
from datetime import date, timezone
from unittest.mock import AsyncMock, patch

import pytest

from src.services.pipeline_resume import (
    PipelineResumeSnapshot,
    beirut_day_start_utc,
    should_auto_retry_completion,
)


def test_beirut_day_start_utc_is_utc_midnight_beirut() -> None:
    d = date(2025, 6, 15)
    start = beirut_day_start_utc(d)
    assert start.tzinfo == timezone.utc
    # 15 juin 2025 : Beyrouth en UTC+3 → minuit local = veille 21:00 UTC
    assert start.hour == 21
    assert start.date() == date(2025, 6, 14)


@pytest.mark.asyncio
async def test_should_auto_retry_true_when_collect_without_summary() -> None:
    eid = uuid.uuid4()
    snap = PipelineResumeSnapshot(
        edition_id=eid,
        has_collect=True,
        has_translate=False,
        has_pipeline_summary=False,
        skip_collect=True,
        skip_translate=False,
        beirut_day=date(2025, 1, 1),
    )
    with (
        patch(
            "src.services.pipeline_debug_log.resolve_current_edition_id",
            new_callable=AsyncMock,
            return_value=eid,
        ),
        patch(
            "src.services.pipeline_resume.load_resume_snapshot_for_edition",
            new_callable=AsyncMock,
            return_value=snap,
        ),
    ):
        out = await should_auto_retry_completion(
            paris_hour=10,
            paris_start_hour=7,
            paris_end_hour=16,
        )
    assert out is True


@pytest.mark.asyncio
async def test_should_auto_retry_false_outside_paris_window() -> None:
    eid = uuid.uuid4()
    snap = PipelineResumeSnapshot(
        edition_id=eid,
        has_collect=True,
        has_translate=False,
        has_pipeline_summary=False,
        skip_collect=True,
        skip_translate=False,
        beirut_day=date(2025, 1, 1),
    )
    with (
        patch(
            "src.services.pipeline_debug_log.resolve_current_edition_id",
            new_callable=AsyncMock,
            return_value=eid,
        ),
        patch(
            "src.services.pipeline_resume.load_resume_snapshot_for_edition",
            new_callable=AsyncMock,
            return_value=snap,
        ),
    ):
        out = await should_auto_retry_completion(
            paris_hour=18,
            paris_start_hour=7,
            paris_end_hour=16,
        )
    assert out is False


@pytest.mark.asyncio
async def test_should_auto_retry_false_when_summary_present() -> None:
    eid = uuid.uuid4()
    snap = PipelineResumeSnapshot(
        edition_id=eid,
        has_collect=True,
        has_translate=True,
        has_pipeline_summary=True,
        skip_collect=True,
        skip_translate=True,
        beirut_day=date(2025, 1, 1),
    )
    with (
        patch(
            "src.services.pipeline_debug_log.resolve_current_edition_id",
            new_callable=AsyncMock,
            return_value=eid,
        ),
        patch(
            "src.services.pipeline_resume.load_resume_snapshot_for_edition",
            new_callable=AsyncMock,
            return_value=snap,
        ),
    ):
        out = await should_auto_retry_completion(
            paris_hour=10,
            paris_start_hour=7,
            paris_end_hour=16,
        )
    assert out is False


@pytest.mark.asyncio
async def test_should_auto_retry_false_without_collect() -> None:
    eid = uuid.uuid4()
    snap = PipelineResumeSnapshot(
        edition_id=eid,
        has_collect=False,
        has_translate=False,
        has_pipeline_summary=False,
        skip_collect=False,
        skip_translate=False,
        beirut_day=date(2025, 1, 1),
    )
    with (
        patch(
            "src.services.pipeline_debug_log.resolve_current_edition_id",
            new_callable=AsyncMock,
            return_value=eid,
        ),
        patch(
            "src.services.pipeline_resume.load_resume_snapshot_for_edition",
            new_callable=AsyncMock,
            return_value=snap,
        ),
    ):
        out = await should_auto_retry_completion(
            paris_hour=10,
            paris_start_hour=7,
            paris_end_hour=16,
        )
    assert out is False


@pytest.mark.asyncio
async def test_should_auto_retry_false_invalid_paris_range() -> None:
    eid = uuid.uuid4()
    snap = PipelineResumeSnapshot(
        edition_id=eid,
        has_collect=True,
        has_translate=False,
        has_pipeline_summary=False,
        skip_collect=True,
        skip_translate=False,
        beirut_day=date(2025, 1, 1),
    )
    with (
        patch(
            "src.services.pipeline_debug_log.resolve_current_edition_id",
            new_callable=AsyncMock,
            return_value=eid,
        ),
        patch(
            "src.services.pipeline_resume.load_resume_snapshot_for_edition",
            new_callable=AsyncMock,
            return_value=snap,
        ),
    ):
        out = await should_auto_retry_completion(
            paris_hour=10,
            paris_start_hour=20,
            paris_end_hour=8,
        )
    assert out is False
