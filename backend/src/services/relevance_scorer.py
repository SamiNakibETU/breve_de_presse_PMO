"""Score de pertinence éditoriale (Prompt 5, MEMW v2) — branché sur relevance_score_v2.yaml."""

from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.article import Article
from src.services.llm_router import get_llm_router
from src.services.prompt_loader import load_prompt_bundle

logger = structlog.get_logger()


def _parse_json(text: str) -> dict[str, Any]:
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        t = "\n".join(lines[1:-1] if len(lines) > 1 else lines)
    return json.loads(t)


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
    try:
        if schema and isinstance(schema, dict) and schema.get("properties"):
            data = await router.generate_anthropic_tool_json(
                bundle.system_prompt,
                user,
                schema,
                tool_name="relevance_score",
                max_tokens=512,
                temperature=0.0,
            )
        else:
            raw = await router.generate_anthropic_only(
                bundle.system_prompt,
                user,
                max_tokens=512,
                temperature=0.0,
            )
            data = _parse_json(raw)
    except Exception as exc:
        logger.warning("relevance.parse_failed", error=str(exc)[:120])
        return {"error": "parse_failed", "detail": str(exc)[:200]}
    score = float(data.get("relevance_score") or 0.0)
    a.relevance_score = score
    await db.commit()
    return {"article_id": str(article_id), "relevance_score": score, "data": data}
