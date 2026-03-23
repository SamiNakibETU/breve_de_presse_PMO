"""Score de pertinence éditoriale (Prompt 5, MEMW v2) — Haiku, YAML relevance_score_v2."""

from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.config import get_settings
from src.models.article import Article
from src.services.llm_router import get_llm_router
from src.services.prompt_loader import load_prompt_bundle

logger = structlog.get_logger()

OUT_OF_SCOPE_THRESHOLD = 0.40


def _parse_json(text: str) -> dict[str, Any]:
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        t = "\n".join(lines[1:-1] if len(lines) > 1 else lines)
    return json.loads(t)


def _normalize_band(score: float, raw_band: str) -> str:
    if score < OUT_OF_SCOPE_THRESHOLD:
        return "out_of_scope"
    b = (raw_band or "").strip().lower()
    if b in ("high", "medium", "low", "out_of_scope"):
        return b
    return "medium"


async def score_article_relevance(
    db: AsyncSession,
    article_id: uuid.UUID,
) -> dict[str, Any]:
    res = await db.execute(
        select(Article)
        .options(selectinload(Article.media_source))
        .where(Article.id == article_id)
    )
    a = res.scalar_one_or_none()
    if not a:
        return {"error": "not_found"}
    bundle = load_prompt_bundle("relevance_score_v2")
    router = get_llm_router()
    ms = a.media_source
    user = bundle.render_user(
        title=(a.title_fr or a.title_original or "")[:500],
        summary_fr=(a.summary_fr or "")[:2000],
        media_name=ms.name if ms else "",
        country_code=ms.country_code if ms else "",
    )
    schema = bundle.json_schema
    s = get_settings()
    haiku = (s.anthropic_translation_model or "").strip() or s.anthropic_generation_model
    try:
        if schema and isinstance(schema, dict) and schema.get("properties"):
            data = await router.generate_anthropic_tool_json(
                bundle.system_prompt,
                user,
                schema,
                tool_name="relevance_score",
                max_tokens=512,
                temperature=0.0,
                model=haiku,
            )
        else:
            raw = await router.generate_anthropic_only(
                bundle.system_prompt,
                user,
                max_tokens=512,
                temperature=0.0,
                model=haiku,
            )
            data = _parse_json(raw)
    except Exception as exc:
        logger.warning("relevance.parse_failed", error=str(exc)[:120])
        return {"error": "parse_failed", "detail": str(exc)[:200]}
    score = float(data.get("relevance_score") or 0.0)
    band = _normalize_band(score, str(data.get("relevance_band") or ""))
    a.relevance_score = score
    a.relevance_band = band
    await db.commit()
    return {
        "article_id": str(article_id),
        "relevance_score": score,
        "relevance_band": band,
        "data": data,
    }


async def run_relevance_scoring_pipeline(
    db: AsyncSession,
    *,
    edition_id: uuid.UUID | None = None,
    limit: int = 500,
) -> dict[str, Any]:
    """
    Après traduction, avant dédup : articles traduits sans bande de pertinence.
    """
    stmt = (
        select(Article)
        .where(Article.summary_fr.isnot(None))
        .where(Article.status.in_(("translated", "needs_review")))
        .where(Article.relevance_band.is_(None))
    )
    if edition_id is not None:
        # Inclure les articles sans édition (orphelins) pour ne pas bloquer le scoring pertinence
        stmt = stmt.where(
            or_(Article.edition_id == edition_id, Article.edition_id.is_(None))
        )
    stmt = stmt.order_by(Article.collected_at.desc()).limit(limit)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    scored = 0
    errors = 0
    for art in rows:
        try:
            await score_article_relevance(db, art.id)
            scored += 1
        except Exception as exc:
            errors += 1
            logger.warning(
                "relevance.pipeline_item_failed",
                article_id=str(art.id),
                error=str(exc)[:160],
            )
    return {
        "candidates": len(rows),
        "scored": scored,
        "errors": errors,
    }
