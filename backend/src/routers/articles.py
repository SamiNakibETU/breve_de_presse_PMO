import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.deps.auth import require_internal_key
from src.models.article import Article
from src.models.edition import Edition
from src.services.edition_schedule import sql_article_belongs_to_edition_corpus
from src.models.media_source import MediaSource
from src.schemas.articles import (
    ArticleIdBatchRequest,
    ArticleIdsRequest,
    ArticleListResponse,
    ArticleResponse,
    ArticleStatsResponse,
    MediaSourceResponse,
)
from src.services.country_utils import country_label_fr, normalize_country_code
from src.services.media_sources_health_payload import build_media_sources_health_payload
from src.services.olj_taxonomy import load_topics_of_day
from src.services.relevance import explain_editorial_relevance

router = APIRouter(prefix="/api")

_BEIRUT_TZ = ZoneInfo("Asia/Beirut")


def _article_list_conditions(
    *,
    edition: Optional[Edition] = None,
    collected_after: Optional[datetime] = None,
    collected_before: Optional[datetime] = None,
    status: Optional[str],
    country: Optional[str],
    article_type: Optional[str],
    language: Optional[str],
    min_confidence: Optional[float],
    include_low_quality: bool,
    hide_syndicated: bool,
    group_syndicated: bool,
    q: Optional[str] = None,
):
    conds: list = []
    if edition is not None:
        conds.append(sql_article_belongs_to_edition_corpus(edition))
    else:
        if collected_after is None:
            raise ValueError("collected_after requis sans edition")
        conds.append(Article.collected_at >= collected_after)
        if collected_before is not None:
            conds.append(Article.collected_at < collected_before)
    if status:
        statuses = [s.strip() for s in status.split(",")]
        conds.append(Article.status.in_(statuses))
    else:
        st = ["translated", "formatted", "needs_review"]
        if include_low_quality:
            st.append("low_quality")
        conds.append(Article.status.in_(st))
    if country:
        codes = [c.strip().upper() for c in country.split(",")]
        conds.append(MediaSource.country_code.in_(codes))
    if article_type:
        types = [t.strip() for t in article_type.split(",")]
        conds.append(Article.article_type.in_(types))
    if language:
        langs = [la.strip() for la in language.split(",")]
        conds.append(Article.source_language.in_(langs))
    if min_confidence is not None:
        conds.append(Article.translation_confidence >= min_confidence)
    if hide_syndicated or group_syndicated:
        conds.append(Article.is_syndicated.is_(False))
    if q and q.strip():
        term = f"%{q.strip()}%"
        conds.append(
            or_(
                Article.title_fr.ilike(term),
                Article.summary_fr.ilike(term),
                Article.thesis_summary_fr.ilike(term),
                Article.editorial_angle.ilike(term),
            ),
        )
    return conds


def _to_response(
    art: Article,
    src: MediaSource,
    *,
    syndicate_siblings_count: Optional[int] = None,
) -> ArticleResponse:
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
        relevance_score=art.relevance_score,
        relevance_score_deterministic=art.relevance_score_deterministic,
        relevance_band=art.relevance_band,
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
        framing_json=art.framing_json if isinstance(art.framing_json, dict) else None,
        framing_actor=getattr(art, "framing_actor", None),
        framing_tone=getattr(art, "framing_tone", None),
        framing_prescription=getattr(art, "framing_prescription", None),
        content_translated_fr=getattr(art, "content_translated_fr", None),
        content_original=getattr(art, "content_original", None),
        en_translation_summary_only=getattr(art, "en_translation_summary_only", None),
        is_syndicated=getattr(art, "is_syndicated", None),
        canonical_article_id=(
            str(art.canonical_article_id) if art.canonical_article_id else None
        ),
        syndicate_siblings_count=syndicate_siblings_count,
        cluster_soft_assigned=getattr(art, "cluster_soft_assigned", None),
        editorial_angle=getattr(art, "editorial_angle", None),
        event_tags=art.event_tags if isinstance(getattr(art, "event_tags", None), list) else None,
        is_flagship=bool(getattr(art, "is_flagship", False)),
        analysis_bullets_fr=(
            list(art.analysis_bullets_fr)
            if isinstance(getattr(art, "analysis_bullets_fr", None), list)
            else None
        ),
        author_thesis_explicit_fr=getattr(art, "author_thesis_explicit_fr", None),
        factual_context_fr=getattr(art, "factual_context_fr", None),
        analysis_tone=getattr(art, "analysis_tone", None),
        fact_opinion_quality=getattr(art, "fact_opinion_quality", None),
        analysis_version=getattr(art, "analysis_version", None),
        analyzed_at=getattr(art, "analyzed_at", None),
        retention_until=getattr(art, "retention_until", None),
        retention_reason=getattr(art, "retention_reason", None),
        scrape_method=getattr(art, "scrape_method", None),
        scrape_cascade_attempts=getattr(art, "scrape_cascade_attempts", None),
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
    include_low_quality: bool = Query(
        default=False,
        description="Inclure les articles au statut low_quality (< seuil confiance)",
    ),
    hide_syndicated: bool = Query(
        default=False,
        description="Masquer les reprises (is_syndicated)",
    ),
    group_syndicated: bool = Query(
        default=False,
        description="Vue canonique : masque les reprises et ajoute syndicate_siblings_count",
    ),
    q: Optional[str] = Query(
        default=None,
        description="Recherche texte (titre, résumé, thèse, angle éditorial)",
    ),
    edition_id: Optional[uuid.UUID] = Query(
        default=None,
        description=(
            "Si défini : articles du corpus de l’édition (rattachement ``edition_id`` à l’ingestion, "
            "repli COALESCE(published_at, collected_at) dans la fenêtre Beyrouth si ``edition_id`` nul) ; "
            "le paramètre days est ignoré pour le bornage temporel."
        ),
    ),
    beirut_date: Optional[str] = Query(
        default=None,
        description=(
            "Journée calendaire Asia/Beirut (YYYY-MM-DD) : filtre ``collected_at`` sur "
            "[minuit local, lendemain minuit local[) converti en UTC. Remplace le glissement ``days``."
        ),
    ),
):
    edition_for_filter: Optional[Edition] = None
    collected_after: datetime | None
    collected_before: datetime | None
    if edition_id is not None:
        ed = await db.get(Edition, edition_id)
        if not ed:
            raise HTTPException(status_code=404, detail="Edition not found")
        edition_for_filter = ed
        collected_after = None
        collected_before = None
    elif beirut_date and beirut_date.strip():
        try:
            d0 = date.fromisoformat(beirut_date.strip()[:10])
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="beirut_date doit être au format YYYY-MM-DD",
            ) from exc
        start_local = datetime.combine(d0, datetime.min.time(), tzinfo=_BEIRUT_TZ)
        end_local = start_local + timedelta(days=1)
        collected_after = start_local.astimezone(timezone.utc)
        collected_before = end_local.astimezone(timezone.utc)
    else:
        collected_after = datetime.now(timezone.utc) - timedelta(days=days)
        collected_before = None

    conds = _article_list_conditions(
        edition=edition_for_filter,
        collected_after=collected_after,
        collected_before=collected_before,
        status=status,
        country=country,
        article_type=article_type,
        language=language,
        min_confidence=min_confidence,
        include_low_quality=include_low_quality,
        hide_syndicated=hide_syndicated,
        group_syndicated=group_syndicated,
        q=q,
    )
    conds.append(MediaSource.is_active.is_(True))

    query = (
        select(Article, MediaSource)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(and_(*conds))
    )

    count_base = (
        select(func.count(Article.id))
        .select_from(Article)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(and_(*conds))
    )
    total = (await db.execute(count_base)).scalar() or 0

    cc_stmt = (
        select(MediaSource.country_code, func.count(Article.id))
        .select_from(Article)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(and_(*conds))
        .group_by(MediaSource.country_code)
    )
    cc_rows = (await db.execute(cc_stmt)).all()
    counts_by_country = {str(row[0]): int(row[1]) for row in cc_rows if row[0]}

    if sort == "date":
        query = query.order_by(Article.collected_at.desc())
    elif sort == "confidence":
        query = query.order_by(Article.translation_confidence.desc().nullslast())
    elif sort == "confidence_asc":
        query = query.order_by(Article.translation_confidence.asc().nullslast())
    elif sort == "relevance":
        query = query.order_by(
            func.coalesce(
                Article.relevance_score,
                Article.relevance_score_deterministic,
            ).desc().nullslast(),
        )
    else:
        query = query.order_by(Article.published_at.desc().nullslast())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.all()

    count_map: dict[str, int] = {}
    if group_syndicated and rows:
        page_ids = [art.id for art, _ in rows]
        cnt_stmt = (
            select(Article.canonical_article_id, func.count(Article.id))
            .where(
                Article.canonical_article_id.in_(page_ids),
                Article.is_syndicated.is_(True),
            )
            .group_by(Article.canonical_article_id)
        )
        for cid, n in (await db.execute(cnt_stmt)).all():
            if cid is not None:
                count_map[str(cid)] = int(n)

    articles: list[ArticleResponse] = []
    for art, src in rows:
        sib = count_map.get(str(art.id)) if group_syndicated else None
        articles.append(
            _to_response(
                art,
                src,
                syndicate_siblings_count=sib if sib else None,
            )
        )

    return ArticleListResponse(
        articles=articles,
        total=total,
        counts_by_country=counts_by_country or None,
    )


@router.post("/articles/by-ids", response_model=ArticleListResponse)
async def list_articles_by_ids(
    body: ArticleIdsRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
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


@router.post("/articles/{article_id}/relevance-score")
async def post_article_relevance_score(
    article_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    """Calcule et persiste relevance_score (MEMW v2 Prompt 5)."""
    try:
        aid = uuid.UUID(article_id)
    except ValueError:
        raise HTTPException(404, "Article not found") from None
    from src.services.relevance_scorer import score_article_relevance

    return await score_article_relevance(db, aid)


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


@router.get("/media-sources/health")
async def media_sources_health(
    db: AsyncSession = Depends(get_db),
    revue_registry_only: bool = Query(
        False,
        description="Limiter aux IDs présents dans MEDIA_REVUE_REGISTRY.json (liste revue OLJ).",
    ),
):
    """Santé des sources : articles collectés sur 72 h (MEMW)."""
    return await build_media_sources_health_payload(
        db, revue_registry_only=revue_registry_only
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


@router.get("/stats", response_model=ArticleStatsResponse)
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

    by_country_code_rows = (
        await db.execute(
            select(MediaSource.country_code, func.count(Article.id))
            .join(MediaSource, Article.media_source_id == MediaSource.id)
            .where(
                Article.collected_at >= cutoff,
                MediaSource.is_active.is_(True),
            )
            .group_by(MediaSource.country_code)
        )
    ).all()
    counts_by_country_code: dict[str, int] = defaultdict(int)
    for raw_cc, cnt in by_country_code_rows:
        cc = normalize_country_code(str(raw_cc) if raw_cc is not None else None)
        counts_by_country_code[cc] += int(cnt or 0)
    counts_by_country_code = dict(
        sorted(counts_by_country_code.items(), key=lambda x: (-x[1], x[0]))
    )
    country_labels_fr = {
        code: country_label_fr(code) for code in counts_by_country_code
    }
    by_country_merged: dict[str, int] = defaultdict(int)
    for code, cnt in counts_by_country_code.items():
        by_country_merged[country_label_fr(code)] += cnt
    by_country = dict(
        sorted(by_country_merged.items(), key=lambda x: (-x[1], x[0]))
    )

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
            .join(MediaSource, Article.media_source_id == MediaSource.id)
            .where(
                Article.collected_at >= cutoff,
                MediaSource.is_active.is_(True),
            )
            .group_by(Article.media_source_id)
            .order_by(func.count(Article.id).desc())
            .limit(25)
        )
    ).all()

    return ArticleStatsResponse(
        total_collected_24h=total_24h,
        total_translated=translated,
        total_needs_review=needs_review,
        total_errors=errors,
        total_translation_abandoned=abandoned,
        total_pending=collected,
        total_no_content=no_content,
        articles_with_embedding_24h=with_embedding,
        articles_with_olj_topics_24h=with_olj_topics,
        countries_covered=len(counts_by_country_code),
        by_status=by_status,
        by_country=by_country,
        counts_by_country_code=counts_by_country_code,
        country_labels_fr=country_labels_fr,
        by_type={row[0]: row[1] for row in by_type_rows},
        by_language={row[0]: row[1] for row in by_lang_rows},
        by_media_source_top=[
            {"media_source_id": str(row[0]), "count": row[1]} for row in by_source_rows
        ],
    )
