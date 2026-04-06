"""
Diagnostic couverture corpus / pipeline pour une édition (fenêtre Beyrouth).
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.article import Article
from src.models.edition import Edition
from src.models.media_source import MediaSource
from src.services.edition_schedule import sql_article_belongs_to_edition_corpus
from src.services.media_revue_registry import get_media_revue_registry_ids

logger = structlog.get_logger(__name__)


async def build_edition_pipeline_diagnostic(
    db: AsyncSession,
    edition_id: uuid.UUID,
) -> dict[str, Any]:
    e = await db.get(Edition, edition_id)
    if not e:
        return {"error": "edition_not_found", "edition_id": str(edition_id)}

    corpus = sql_article_belongs_to_edition_corpus(e)
    reg_ids = get_media_revue_registry_ids()

    total_stmt = (
        select(func.count(Article.id))
        .select_from(Article)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(corpus)
    )
    total = int((await db.execute(total_stmt)).scalar_one() or 0)

    status_stmt = (
        select(Article.status, func.count(Article.id))
        .select_from(Article)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(corpus)
        .group_by(Article.status)
    )
    status_rows = await db.execute(status_stmt)
    by_status: dict[str, int] = defaultdict(int)
    for st, cnt in status_rows.all():
        key = str(st or "unknown")
        by_status[key] = int(cnt)

    pend_stmt = (
        select(func.count(Article.id))
        .select_from(Article)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(corpus)
        .where(Article.status == "translated")
        .where(Article.summary_fr.isnot(None))
        .where(Article.embedding.is_(None))
        .where(Article.is_syndicated.is_(False))
        .where(Article.canonical_article_id.is_(None))
    )
    pending_embedding = int((await db.execute(pend_stmt)).scalar_one() or 0)

    in_reg = 0
    if reg_ids:
        in_reg_stmt = (
            select(func.count(Article.id))
            .select_from(Article)
            .join(MediaSource, Article.media_source_id == MediaSource.id)
            .where(corpus)
            .where(Article.media_source_id.in_(tuple(reg_ids)))
        )
        in_reg = int((await db.execute(in_reg_stmt)).scalar_one() or 0)

    out_reg = max(0, total - in_reg)

    suggested: list[dict[str, str]] = []
    if pending_embedding > 0:
        suggested.append(
            {
                "id": "embedding_then_clusters",
                "label_fr": "Lancer embeddings / clusters (refresh) pour vider la file traduite.",
            },
        )
    if total == 0:
        suggested.append(
            {
                "id": "complete_collection",
                "label_fr": "Corpus vide pour cette édition : lancer collecte (hubs / RSS) pour la fenêtre.",
            },
        )
    elif in_reg < total * 0.5 and reg_ids:
        suggested.append(
            {
                "id": "review_collection_scope",
                "label_fr": "Part du corpus hors registre revue : vérifier rattachement édition ou sources.",
            },
        )
    suggested.append(
        {
            "id": "pipeline_only",
            "label_fr": "Enchaîner traduction / analyse / sujets sans rescrape (tâches Régie étape par étape).",
        },
    )

    payload = {
        "edition_id": str(edition_id),
        "publish_date": e.publish_date.isoformat(),
        "window_start": e.window_start.isoformat() if e.window_start else None,
        "window_end": e.window_end.isoformat() if e.window_end else None,
        "corpus_article_count": total,
        "by_status": dict(by_status),
        "translated_pending_embedding": pending_embedding,
        "corpus_in_revue_registry_count": in_reg,
        "corpus_outside_revue_registry_count": out_reg,
        "revue_registry_ids_loaded": len(reg_ids),
        "suggested_actions": suggested,
    }
    logger.info(
        "pipeline_edition.diagnostic",
        edition_id=payload["edition_id"],
        corpus_article_count=payload["corpus_article_count"],
        translated_pending_embedding=payload["translated_pending_embedding"],
    )
    return payload
