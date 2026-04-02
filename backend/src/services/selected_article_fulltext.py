"""Traduction corps FR pour articles en rétention « topic_selection » (plan v2)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.models.edition import Edition, EditionTopic, EditionTopicArticle
from src.services.translator import TranslationPipeline

logger = structlog.get_logger(__name__)


def _needs_full_translation_fr(art: Article) -> bool:
    if bool(getattr(art, "en_translation_summary_only", None)):
        return True
    body_fr = (art.content_translated_fr or "").strip()
    if len(body_fr) == 0:
        return True
    original = (art.content_original or "").strip()
    if not original:
        return False
    ratio = len(body_fr) / max(len(original), 1)
    if ratio < 0.25 and len(body_fr) < 1500:
        return True
    return False


async def _load_candidates(db: AsyncSession, limit: int) -> list[Article]:
    """Articles en rétention « topic_selection » ou sélectionnés dans un sujet d’édition récent."""
    s = get_settings()
    now = datetime.now(timezone.utc)
    stmt_ret = (
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
    res = await db.execute(stmt_ret)
    rows = list(res.scalars().all())

    stmt_ed = (
        select(Article)
        .join(EditionTopicArticle, EditionTopicArticle.article_id == Article.id)
        .join(EditionTopic, EditionTopicArticle.edition_topic_id == EditionTopic.id)
        .join(Edition, EditionTopic.edition_id == Edition.id)
        .where(
            EditionTopicArticle.is_selected.is_(True),
            Edition.window_end >= now - timedelta(days=14),
            Article.content_original.isnot(None),
            Article.translation_failure_count < s.max_translation_failures,
        )
        .order_by(Edition.window_end.desc())
        .limit(max(limit * 4, limit))
    )
    res_ed = await db.execute(stmt_ed)
    rows_ed = list(res_ed.scalars().all())

    merged: list[Article] = []
    seen: set[str] = set()
    for a in rows + rows_ed:
        aid = str(a.id)
        if aid in seen:
            continue
        seen.add(aid)
        merged.append(a)

    out: list[Article] = []
    for a in merged:
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
    if not out:
        logger.info(
            "selected_fulltext.no_candidates",
            retention_rows=len(rows),
            edition_selection_rows=len(rows_ed),
        )
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
