import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.deps.auth import require_internal_key
from src.models.article import Article
from src.models.media_source import MediaSource
from src.schemas.articles import (
    ArticleIdBatchRequest,
    ArticleIdsRequest,
    ArticleListResponse,
    ArticleResponse,
    MediaSourceResponse,
)
from src.services.olj_taxonomy import load_topics_of_day
from src.services.relevance import explain_editorial_relevance

router = APIRouter(prefix="/api")


def _to_response(art: Article, src: MediaSource) -> ArticleResponse:
    topics_day = load_topics_of_day()
    expl = explain_editorial_relevance(
        country_code=src.country_code,
        article_type=art.article_type,
        published_at=art.published_at,
        source_language=art.source_language,
        tier=src.tier,
        has_summary=bool(art.summary_fr),
        has_quotes=bool(art.key_quotes_fr and len(art.key_quotes_fr) > 0),
        olj_topic_ids=art.olj_topic_ids if isinstance(art.olj_topic_ids, list) else None,
        topics_of_day=topics_day,
    )
    olj_ids = art.olj_topic_ids if isinstance(art.olj_topic_ids, list) else None
    return ArticleResponse(
        id=str(art.id),
        title_fr=art.title_fr,
        title_original=art.title_original,
        media_source_id=art.media_source_id,
        media_name=src.name,
        country=src.country,
        country_code=src.country_code,
        author=art.author,
        published_at=art.published_at,
        article_type=art.article_type,
        source_language=art.source_language,
        translation_confidence=art.translation_confidence,
        translation_notes=art.translation_notes,
        summary_fr=art.summary_fr,
        thesis_summary_fr=art.thesis_summary_fr,
        key_quotes_fr=art.key_quotes_fr,
        url=art.url,
        status=art.status,
        word_count=art.word_count,
        collected_at=art.collected_at,
        editorial_relevance=expl["score"],
        why_ranked=expl,
        olj_topic_ids=olj_ids,
        article_family=art.article_family,
        paywall_observed=getattr(art, "paywall_observed", False),
        published_at_source=art.published_at_source,
        stance_summary=art.stance_summary,
        primary_editorial_event_id=(
            str(art.primary_editorial_event_id)
            if art.primary_editorial_event_id
            else None
        ),
        processing_error=art.processing_error,
        translation_failure_count=art.translation_failure_count,
    )


@router.get("/articles", response_model=ArticleListResponse)
async def list_articles(
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(None),
    country: Optional[str] = Query(None, description="Comma-separated country codes"),
    article_type: Optional[str] = Query(None, description="Comma-separated types"),
    language: Optional[str] = Query(None, description="Comma-separated language codes"),
    min_confidence: Optional[float] = Query(None, ge=0, le=1),
    days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    sort: Optional[str] = Query(
        default="relevance",
        description="relevance|date|confidence|confidence_asc",
    ),
):
    query = (
        select(Article, MediaSource)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(
            Article.collected_at >= datetime.now(timezone.utc) - timedelta(days=days)
        )
    )

    if status:
        statuses = [s.strip() for s in status.split(",")]
        query = query.where(Article.status.in_(statuses))
    else:
        query = query.where(
            Article.status.in_(["translated", "formatted", "needs_review"])
        )

    if country:
        codes = [c.strip().upper() for c in country.split(",")]
        query = query.where(MediaSource.country_code.in_(codes))

    if article_type:
        types = [t.strip() for t in article_type.split(",")]
        query = query.where(Article.article_type.in_(types))

    if language:
        langs = [la.strip() for la in language.split(",")]
        query = query.where(Article.source_language.in_(langs))

    if min_confidence is not None:
        query = query.where(Article.translation_confidence >= min_confidence)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    if sort == "date":
        query = query.order_by(Article.collected_at.desc())
    elif sort == "confidence":
        query = query.order_by(Article.translation_confidence.desc().nullslast())
    elif sort == "confidence_asc":
        query = query.order_by(Article.translation_confidence.asc().nullslast())
    else:
        query = query.order_by(Article.published_at.desc().nullslast())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.all()

    articles = [_to_response(art, src) for art, src in rows]

    if sort == "relevance":
        articles.sort(key=lambda a: a.editorial_relevance or 0, reverse=True)

    return ArticleListResponse(articles=articles, total=total)


@router.post("/articles/by-ids", response_model=ArticleListResponse)
async def list_articles_by_ids(
    body: ArticleIdsRequest,
    db: AsyncSession = Depends(get_db),
):
    """Retourne uniquement les articles demandés (ordre préservé). Revue de presse sans charger 200 lignes."""
    if not body.ids:
        return ArticleListResponse(articles=[], total=0)
    if len(body.ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 ids par requête")

    parsed: list[uuid.UUID] = []
    order_index: dict[uuid.UUID, int] = {}
    for i, raw in enumerate(body.ids):
        try:
            u = uuid.UUID(str(raw).strip())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"UUID invalide: {raw!r}")
        if u not in order_index:
            order_index[u] = i
            parsed.append(u)

    stmt = (
        select(Article, MediaSource)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(Article.id.in_(parsed))
    )
    result = await db.execute(stmt)
    rows = result.all()
    responses = [_to_response(art, src) for art, src in rows]
    responses.sort(key=lambda a: order_index[uuid.UUID(a.id)])

    return ArticleListResponse(articles=responses, total=len(responses))


def _parse_uuid_batch(ids: list[str]) -> list[uuid.UUID]:
    out: list[uuid.UUID] = []
    for raw in ids:
        try:
            out.append(uuid.UUID(str(raw).strip()))
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"UUID invalide: {raw!r}",
            ) from exc
    return out


@router.post("/articles/batch-retry-translation")
async def batch_retry_translation(
    body: ArticleIdBatchRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    """Remet les articles en file traduction (dead letter / erreurs)."""
    ids = _parse_uuid_batch(body.ids)
    res = await db.execute(
        update(Article)
        .where(Article.id.in_(ids))
        .values(
            status="collected",
            translation_failure_count=0,
            processing_error=None,
        )
    )
    await db.commit()
    return {"status": "ok", "updated": res.rowcount}


@router.post("/articles/batch-abandon-translation")
async def batch_abandon_translation(
    body: ArticleIdBatchRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    """Marque les articles comme abandonnés côté traduction automatique."""
    ids = _parse_uuid_batch(body.ids)
    res = await db.execute(
        update(Article)
        .where(Article.id.in_(ids))
        .values(status="translation_abandoned")
    )
    await db.commit()
    return {"status": "ok", "updated": res.rowcount}


@router.post("/articles/batch-mark-reviewed", response_model=dict)
async def batch_mark_reviewed(
    body: ArticleIdBatchRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    """Passe needs_review → translated (validation éditoriale)."""
    ids = _parse_uuid_batch(body.ids)
    res = await db.execute(
        update(Article)
        .where(Article.id.in_(ids), Article.status == "needs_review")
        .values(status="translated")
    )
    await db.commit()
    return {"status": "ok", "updated": res.rowcount}


@router.get("/articles/{article_id}", response_model=ArticleResponse)
async def get_article(article_id: str, db: AsyncSession = Depends(get_db)):
    try:
        aid = uuid.UUID(article_id)
    except ValueError:
        raise HTTPException(404, "Article not found") from None
    result = await db.execute(
        select(Article, MediaSource)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(Article.id == aid)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(404, "Article not found")

    art, src = row
    return _to_response(art, src)


@router.get("/media-sources", response_model=list[MediaSourceResponse])
async def list_media_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MediaSource).order_by(MediaSource.tier, MediaSource.name)
    )
    sources = result.scalars().all()

    return [
        MediaSourceResponse(
            id=s.id,
            name=s.name,
            country=s.country,
            country_code=s.country_code,
            tier=s.tier,
            languages=s.languages,
            bias=s.bias,
            collection_method=s.collection_method,
            paywall=s.paywall,
            is_active=s.is_active,
            last_collected_at=s.last_collected_at,
        )
        for s in sources
    ]


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    total_24h = (
        await db.execute(
            select(func.count(Article.id)).where(Article.collected_at >= cutoff)
        )
    ).scalar() or 0

    by_status_rows = (
        await db.execute(
            select(Article.status, func.count(Article.id))
            .where(Article.collected_at >= cutoff)
            .group_by(Article.status)
        )
    ).all()
    by_status = {row[0]: row[1] for row in by_status_rows}

    translated = by_status.get("translated", 0)
    needs_review = by_status.get("needs_review", 0)
    errors = by_status.get("error", 0)
    abandoned = by_status.get("translation_abandoned", 0)
    collected = by_status.get("collected", 0)

    no_content = (
        await db.execute(
            select(func.count(Article.id)).where(
                Article.collected_at >= cutoff,
                Article.content_original.is_(None),
            )
        )
    ).scalar() or 0

    by_country_rows = (
        await db.execute(
            select(MediaSource.country, func.count(Article.id))
            .join(MediaSource, Article.media_source_id == MediaSource.id)
            .where(Article.collected_at >= cutoff)
            .group_by(MediaSource.country)
        )
    ).all()

    by_type_rows = (
        await db.execute(
            select(Article.article_type, func.count(Article.id))
            .where(Article.collected_at >= cutoff, Article.article_type.isnot(None))
            .group_by(Article.article_type)
        )
    ).all()

    by_lang_rows = (
        await db.execute(
            select(Article.source_language, func.count(Article.id))
            .where(Article.collected_at >= cutoff, Article.source_language.isnot(None))
            .group_by(Article.source_language)
        )
    ).all()

    with_embedding = (
        await db.execute(
            select(func.count(Article.id)).where(
                Article.collected_at >= cutoff,
                Article.embedding.isnot(None),
            )
        )
    ).scalar() or 0

    with_olj_topics = (
        await db.execute(
            select(func.count(Article.id)).where(
                Article.collected_at >= cutoff,
                Article.olj_topic_ids.isnot(None),
            )
        )
    ).scalar() or 0

    by_source_rows = (
        await db.execute(
            select(Article.media_source_id, func.count(Article.id))
            .where(Article.collected_at >= cutoff)
            .group_by(Article.media_source_id)
            .order_by(func.count(Article.id).desc())
            .limit(25)
        )
    ).all()

    return {
        "total_collected_24h": total_24h,
        "total_translated": translated,
        "total_needs_review": needs_review,
        "total_errors": errors,
        "total_translation_abandoned": abandoned,
        "total_pending": collected,
        "total_no_content": no_content,
        "articles_with_embedding_24h": with_embedding,
        "articles_with_olj_topics_24h": with_olj_topics,
        "countries_covered": len(by_country_rows),
        "by_status": by_status,
        "by_country": {row[0]: row[1] for row in by_country_rows},
        "by_type": {row[0]: row[1] for row in by_type_rows},
        "by_language": {row[0]: row[1] for row in by_lang_rows},
        "by_media_source_top": [
            {"media_source_id": row[0], "count": row[1]} for row in by_source_rows
        ],
    }
