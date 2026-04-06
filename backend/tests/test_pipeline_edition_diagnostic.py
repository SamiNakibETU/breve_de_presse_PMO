"""Diagnostic pipeline édition (compteurs corpus)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.article import Article
from src.models.edition import Edition
from src.models.media_source import MediaSource
from src.services.pipeline_edition_diagnostic import build_edition_pipeline_diagnostic


class _FakeDb:
    async def get(self, _model, _eid):  # noqa: ANN001
        return None


@pytest.mark.asyncio
async def test_diagnostic_unknown_edition() -> None:
    fake_id = uuid.uuid4()
    out = await build_edition_pipeline_diagnostic(_FakeDb(), fake_id)  # type: ignore[arg-type]
    assert out.get("error") == "edition_not_found"


@pytest.mark.asyncio
async def test_diagnostic_counts_corpus(db_session: AsyncSession, sample_source: MediaSource) -> None:
    w0 = datetime(2026, 4, 1, 15, 0, tzinfo=timezone.utc)
    w1 = datetime(2026, 4, 2, 3, 0, tzinfo=timezone.utc)
    ed = Edition(
        publish_date=date(2026, 4, 2),
        window_start=w0,
        window_end=w1,
        timezone="Asia/Beirut",
        status="open",
    )
    db_session.add(ed)
    await db_session.flush()

    a1 = Article(
        id=uuid.uuid4(),
        media_source_id=sample_source.id,
        url="https://test.example.com/u1",
        url_hash="h1",
        title_original="T1",
        edition_id=ed.id,
        status="translated",
        summary_fr="S",
        collected_at=w0,
        word_count=50,
        is_syndicated=False,
    )
    db_session.add(a1)
    await db_session.commit()

    out = await build_edition_pipeline_diagnostic(db_session, ed.id)
    assert out.get("error") is None
    assert out["corpus_article_count"] >= 1
    assert "by_status" in out
    assert out["translated_pending_embedding"] >= 1
