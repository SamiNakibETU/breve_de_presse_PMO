"""
Re-classifie les topics OLJ pour les articles déjà traduits (appel LLM par article).

Usage (backend/) :
  python -m src.scripts.backfill_olj_topics --limit 50
  python -m src.scripts.backfill_olj_topics --dry-run --limit 10

Nécessite les clés LLM comme le pipeline de traduction.
"""

from __future__ import annotations

import argparse
import asyncio
import json

import structlog
from sqlalchemy import select

from src.database import get_session_factory
from src.models.article import Article
from src.services.llm_router import get_llm_router
from src.services.olj_taxonomy import taxonomy_prompt_block, validate_olj_topic_ids

logger = structlog.get_logger(__name__)

SYSTEM = """Tu es un bibliothécaire éditorial. Réponds UNIQUEMENT par un JSON :
{"olj_topic_ids": ["id1", "id2"]}
en choisissant 1 à 5 ids parmi la taxonomie fournie (sinon ["other"])."""


async def _one(router, article: Article) -> list[str]:
    tax = taxonomy_prompt_block()
    payload = json.dumps(
        {
            "title": article.title_fr or article.title_original,
            "summary_excerpt": (article.summary_fr or "")[:1200],
            "taxonomy": tax,
        },
        ensure_ascii=False,
    )
    raw = await router.generate(system=SYSTEM, prompt=payload, max_tokens=200)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    data = json.loads(raw)
    return validate_olj_topic_ids(data.get("olj_topic_ids")) or validate_olj_topic_ids(
        ["other"],
    )


async def run(*, limit: int, dry_run: bool) -> None:
    factory = get_session_factory()
    router = get_llm_router()
    async with factory() as db:
        stmt = (
            select(Article)
            .where(Article.status.in_(["translated", "formatted", "needs_review"]))
            .where(Article.olj_topic_ids.is_(None))
            .order_by(Article.processed_at.desc().nullslast())
            .limit(limit)
        )
        res = await db.execute(stmt)
        articles = res.scalars().all()

    updated = 0
    for art in articles:
        try:
            tids = await _one(router, art)
        except Exception as exc:
            logger.warning("backfill.topic_failed", id=str(art.id), error=str(exc)[:120])
            continue
        if dry_run:
            logger.info("backfill.would_set", id=str(art.id), topics=tids)
            continue
        async with factory() as db:
            row = await db.get(Article, art.id)
            if row:
                row.olj_topic_ids = tids
                await db.commit()
                updated += 1
        await asyncio.sleep(0.4)
    logger.info("backfill.done", processed=len(articles), updated=updated, dry_run=dry_run)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=30)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    asyncio.run(run(limit=max(1, args.limit), dry_run=args.dry_run))


if __name__ == "__main__":
    main()
