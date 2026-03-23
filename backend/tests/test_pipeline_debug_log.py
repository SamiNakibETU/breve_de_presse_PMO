"""Persistance pipeline_debug_logs (helper)."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.services.pipeline_debug_log import append_pipeline_debug_log, compact_payload


@pytest.mark.asyncio
async def test_append_pipeline_debug_log_adds_row_and_commits() -> None:
    db = MagicMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    eid = uuid4()
    await append_pipeline_debug_log(db, eid, "collect", {"ok": True})
    db.add.assert_called_once()
    assert db.add.call_args[0][0].step == "collect"
    assert db.add.call_args[0][0].edition_id == eid
    db.commit.assert_awaited_once()


def test_compact_payload_truncates_many_keys() -> None:
    big = {f"k{i}": i for i in range(60)}
    out = compact_payload(big, max_keys=10)
    assert len(out) == 10
