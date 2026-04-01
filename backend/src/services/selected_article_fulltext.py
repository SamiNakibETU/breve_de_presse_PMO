"""Traduction corps FR pour articles en rétention « topic_selection » (plan v2)."""

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.services.translator import TranslationPipeline

logger = structlog.get_logger(__name__)


def _needs_full_translation_fr(art: Article) -> bool:
    if bool(getattr(art, "en_translation_summary_only", None)):
        return True
    body = (art.content_translated_fr or "").strip()
    return len(body) == 0


async def _load_candidates(db: AsyncSession, limit: int) -> list[Article]:
    s = get_settings()
    now = datetime.now(timezone.utc)
    stmt = (
        select(Article)
        .where(
            Article.retention_until.isnot(None),
            Article.retention_until > now,
            Article.retention_reason == "topic_selection",
            Article.content_original.isnot(None),
            Article.translation_failure_count < s.max_translation_failures,
        )
        .order_by(Article.retention_until.asc())
        .limit(max(limit * 4, limit))
    )
    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    out: list[Article] = []
    for a in rows:
        if not _needs_full_translation_fr(a):
            continue
        raw = (a.content_original or "").strip()
        if len(raw.split()) < 30 and len((a.title_original or "").split()) < 5:
            continue
        if not s.force_full_translation_for_selected and a.en_translation_summary_only:
            continue
        out.append(a)
        if len(out) >= limit:
            break
    return out


async def run_selected_article_fulltext_job() -> dict:
    """Job APScheduler : file de traduction corps pour sélections actives."""
    s = get_settings()
    if not s.auto_translate_selected_articles:
        return {"skipped": True, "reason": "auto_translate_disabled"}
    if not s.store_full_translation_fr:
        logger.info("selected_fulltext.skip", reason="store_full_translation_fr_off")
        return {"skipped": True, "reason": "store_full_translation_fr_off"}
    lim = s.selected_full_translation_batch_limit
    factory = get_session_factory()
    async with factory() as db:
        candidates = await _load_candidates(db, lim)
    if not candidates:
        return {"candidates": 0, "done": 0}
    pipeline = TranslationPipeline()
    override: bool | None = False if s.force_full_translation_for_selected else None
    done = 0
    for art in candidates:
        try:
            await pipeline.translate_article_retention_selected(
                art,
                en_summary_only_override=override,
            )
            done += 1
        except Exception as exc:
            logger.warning(
                "selected_fulltext.article_failed",
                article_id=str(art.id),
                error=str(exc)[:200],
            )
    logger.info(
        "selected_fulltext.batch_done",
        candidates=len(candidates),
        done=done,
    )
    return {"candidates": len(candidates), "done": done}
