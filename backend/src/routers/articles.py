from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models.article import Article
from src.models.media_source import MediaSource
from src.schemas.articles import (
    ArticleListResponse,
    ArticleResponse,
    MediaSourceResponse,
)

router = APIRouter(prefix="/api")


@router.get("/articles", response_model=ArticleListResponse)
async def list_articles(
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(None),
    country: Optional[str] = Query(None, description="Comma-separated country codes"),
    article_type: Optional[str] = Query(None, description="Comma-separated types"),
    language: Optional[str] = Query(None, description="Comma-separated language codes"),
    min_confidence: Optional[float] = Query(None, ge=0, le=1),
    days: int = Query(default=2, ge=1, le=30),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
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

    query = query.order_by(Article.published_at.desc().nullslast()).limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.all()

    articles = [
        ArticleResponse(
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
        )
        for art, src in rows
    ]

    return ArticleListResponse(articles=articles, total=total)


@router.get("/articles/{article_id}", response_model=ArticleResponse)
async def get_article(article_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Article, MediaSource)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(Article.id == article_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(404, "Article not found")

    art, src = row
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
    )


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

    translated = (
        await db.execute(
            select(func.count(Article.id)).where(
                Article.collected_at >= cutoff,
                Article.status == "translated",
            )
        )
    ).scalar() or 0

    needs_review = (
        await db.execute(
            select(func.count(Article.id)).where(
                Article.collected_at >= cutoff,
                Article.status == "needs_review",
            )
        )
    ).scalar() or 0

    errors = (
        await db.execute(
            select(func.count(Article.id)).where(
                Article.collected_at >= cutoff,
                Article.status == "error",
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

    return {
        "total_collected_24h": total_24h,
        "total_translated": translated,
        "total_needs_review": needs_review,
        "total_errors": errors,
        "countries_covered": len(by_country_rows),
        "by_country": {row[0]: row[1] for row in by_country_rows},
        "by_type": {row[0]: row[1] for row in by_type_rows},
        "by_language": {row[0]: row[1] for row in by_lang_rows},
    }
