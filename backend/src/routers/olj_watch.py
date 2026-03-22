"""Recherche sémantique, sauvegardes de veille, évaluations traduction (roadmap OLJ)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.database import get_db
from src.deps.auth import require_internal_key
from src.models.article import Article
from src.models.saved_search import SavedSearch
from src.models.translation_review import TranslationReview
from src.schemas.olj_watch import (
    SavedSearchCreate,
    SavedSearchResponse,
    SemanticSearchHit,
    SemanticSearchRequest,
    SemanticSearchResponse,
    TranslationReviewCreate,
    TranslationReviewResponse,
)
from src.services.embedding_service import EmbeddingService
from src.services.olj_taxonomy import validate_olj_topic_ids

router = APIRouter(prefix="/api", tags=["olj-watch"])


def _pg_vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in vec) + "]"


@router.post("/articles/search/semantic", response_model=SemanticSearchResponse)
async def semantic_search(
    body: SemanticSearchRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    settings = get_settings()
    if not settings.cohere_api_key:
        raise HTTPException(503, detail="COHERE_API_KEY requis pour la recherche sémantique")
    bind = db.get_bind()
    if bind is None or "postgresql" not in str(bind.url).lower():
        raise HTTPException(
            501,
            detail="Recherche sémantique disponible uniquement avec PostgreSQL + pgvector",
        )

    try:
        service = EmbeddingService()
        qvec = service.embed_query(body.query)
    except Exception as exc:
        raise HTTPException(503, detail=f"Embedding requête: {exc!s}") from exc

    lit = _pg_vector_literal(qvec)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=body.hours)

    params: dict = {
        "lim": body.limit,
        "cutoff": cutoff,
        "qvec": lit,
    }
    where_extra = ["a.embedding IS NOT NULL", "a.collected_at >= :cutoff"]
    if body.country_codes:
        codes = [c.strip().upper() for c in body.country_codes if c.strip()]
        if codes:
            where_extra.append("m.country_code = ANY(:ccodes)")
            params["ccodes"] = codes
    if body.article_types:
        where_extra.append("a.article_type = ANY(:atypes)")
        params["atypes"] = body.article_types
    topic_filter = validate_olj_topic_ids(body.topic_ids or [], max_topics=20)
    fetch_lim = min(max(body.limit * 5, body.limit), 200) if topic_filter else body.limit
    params["lim"] = fetch_lim

    sql = f"""
    SELECT a.id,
           (a.embedding <=> CAST(:qvec AS vector)) AS dist,
           a.title_fr,
           a.url,
           a.olj_topic_ids
    FROM articles a
    JOIN media_sources m ON m.id = a.media_source_id
    WHERE {" AND ".join(where_extra)}
    ORDER BY a.embedding <=> CAST(:qvec AS vector)
    LIMIT :lim
    """
    try:
        result = await db.execute(text(sql), params)
        rows = result.all()
    except Exception as exc:
        raise HTTPException(500, detail=f"Recherche SQL: {exc!s}") from exc

    want_topics = set(topic_filter)
    hits: list[SemanticSearchHit] = []
    for r in rows:
        tids = r[4]
        if want_topics:
            if not isinstance(tids, list):
                continue
            if not (set(tids) & want_topics):
                continue
        hits.append(
            SemanticSearchHit(
                article_id=str(r[0]),
                distance=float(r[1]),
                title_fr=r[2],
                url=r[3],
            )
        )
        if len(hits) >= body.limit:
            break
    return SemanticSearchResponse(hits=hits, query=body.query)


@router.post("/saved-searches", response_model=SavedSearchResponse)
async def create_saved_search(
    body: SavedSearchCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    row = SavedSearch(
        query_text=body.query_text.strip(),
        filters_json=body.filters_json,
        owner=body.owner,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return SavedSearchResponse(
        id=str(row.id),
        query_text=row.query_text,
        filters_json=row.filters_json,
        owner=row.owner,
        created_at=row.created_at,
    )


@router.get("/saved-searches", response_model=list[SavedSearchResponse])
async def list_saved_searches(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
):
    res = await db.execute(
        select(SavedSearch).order_by(SavedSearch.created_at.desc()).limit(limit)
    )
    rows = res.scalars().all()
    return [
        SavedSearchResponse(
            id=str(r.id),
            query_text=r.query_text,
            filters_json=r.filters_json,
            owner=r.owner,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/translation-reviews", response_model=TranslationReviewResponse)
async def create_translation_review(
    body: TranslationReviewCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    try:
        aid = uuid.UUID(body.article_id.strip())
    except ValueError as exc:
        raise HTTPException(400, detail="article_id UUID invalide") from exc
    art = await db.get(Article, aid)
    if not art:
        raise HTTPException(404, detail="Article introuvable")
    row = TranslationReview(
        article_id=aid,
        rating=body.rating,
        reviewer=body.reviewer,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return TranslationReviewResponse(
        id=str(row.id),
        article_id=str(row.article_id),
        rating=row.rating,
        reviewer=row.reviewer,
        notes=row.notes,
        created_at=row.created_at,
    )
