"""API — éditions et sujets (fenêtre Beyrouth)."""

from collections import defaultdict
from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.deps.auth import require_internal_key
from src.models.article import Article
from src.models.edition import Edition, EditionTopic, EditionTopicArticle
from src.models.media_source import MediaSource
from src.services.curator_service import (
    list_clusters_fallback_for_edition,
    run_curator_for_edition,
)
from src.services.edition_review_generator import (
    generate_all_edition_topics,
    generate_edition_topic_review,
)
from src.services.edition_schedule import (
    ensure_edition_for_publish_date,
    find_edition_for_calendar_date,
    sql_article_belongs_to_edition_corpus,
)
from src.services.selected_article_retention import (
    apply_retention_for_selected_article_ids,
    clear_retention_if_unselected,
)
from src.services.pipeline_edition_diagnostic import build_edition_pipeline_diagnostic
from src.services.topic_detector import run_topic_detection_for_edition_id

router = APIRouter(prefix="/api/editions", tags=["editions"])

TOPIC_ARTICLE_PREVIEW_DEFAULT = 6
TOPIC_ARTICLE_PREVIEW_MAX = 200


def _dedupe_uuid_preserve_order(items: list[UUID]) -> list[UUID]:
    """Dédoublonne en conservant l’ordre (ordre d’édition / rédaction)."""
    seen: set[UUID] = set()
    out: list[UUID] = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


class EditionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    publish_date: date
    window_start: str
    window_end: str
    timezone: str
    target_topics_min: int
    target_topics_max: int
    status: str
    curator_run_id: Optional[UUID] = None
    pipeline_trace_id: Optional[UUID] = None
    generated_text: Optional[str] = None
    detection_status: str = "pending"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    corpus_article_count: Optional[int] = None
    corpus_country_count: Optional[int] = None
    compose_instructions_fr: Optional[str] = None


class CreateCustomEditionBody(BaseModel):
    """Créer une édition couvrant une période arbitraire (ex. « grande édition » manuelle)."""

    publish_date: date = Field(description="Date de parution affichée.")
    window_start: datetime = Field(description="Début de la fenêtre de collecte (UTC ou avec tz).")
    window_end: datetime = Field(description="Fin de la fenêtre de collecte (UTC ou avec tz).")
    label: Optional[str] = Field(
        default=None,
        description="Libellé optionnel pour cette édition (ex. « Édition spéciale semaine 14 »).",
    )


class CustomEditionPipelineBody(BaseModel):
    """Lance le pipeline d'analyse + détection sujets sur une édition custom existante."""

    run_analysis: bool = Field(default=True, description="Lancer l'analyse experte (bullets, thèse, etc.).")
    run_topic_detection: bool = Field(default=True, description="Lancer la détection de sujets LLM.")
    analysis_force: bool = Field(default=True, description="Ré-analyser même si déjà analysé.")


class EditionPatch(BaseModel):
    status: Optional[str] = None
    generated_text: Optional[str] = None
    pipeline_trace_id: Optional[UUID] = None
    curator_run_id: Optional[UUID] = None


class TopicArticlePreviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title_fr: Optional[str] = None
    title_original: str
    media_name: str
    url: str
    thesis_summary_fr: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    editorial_relevance: Optional[int] = None
    article_type: Optional[str] = None
    source_language: Optional[str] = None
    author: Optional[str] = None
    editorial_angle: Optional[str] = None
    is_flagship: Optional[bool] = None
    analysis_bullets_fr: Optional[list[str]] = None
    summary_fr: Optional[str] = None
    has_full_translation_fr: bool = False
    collected_at: Optional[datetime] = None


class EditionTopicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rank: int
    user_rank: Optional[int] = None
    title_proposed: str
    title_final: Optional[str] = None
    status: str
    dominant_angle: Optional[str] = None
    counter_angle: Optional[str] = None
    editorial_note: Optional[str] = None
    angle_summary: Optional[str] = None
    country_coverage: Optional[dict[str, Any]] = None
    generated_text: Optional[str] = None
    angle_id: Optional[str] = None
    description: Optional[str] = None
    is_multi_perspective: bool = False
    countries: Optional[list[str]] = None
    article_count: Optional[int] = None
    article_previews: Optional[list[TopicArticlePreviewOut]] = None


class TopicArticleRef(BaseModel):
    article_id: UUID
    is_selected: bool
    is_recommended: bool
    rank_in_topic: Optional[int] = None
    fit_confidence: Optional[float] = None
    perspective_rarity: Optional[int] = None
    display_order: Optional[int] = None


class TopicSelectionBody(BaseModel):
    """Liste d'articles inclus dans la rédaction pour ce sujet."""

    selected_article_ids: list[UUID]


class GenerateTopicBody(BaseModel):
    article_ids: Optional[list[UUID]] = None
    instruction_suffix: Optional[str] = None


class ComposePreferencesPatch(BaseModel):
    """Mise à jour partielle : n’envoyer que les champs à modifier (exclude_unset)."""

    extra_selected_article_ids: Optional[list[UUID]] = None
    compose_instructions_fr: Optional[str] = None


class EditionTopicPatchBody(BaseModel):
    """Ordre d’affichage personnalisé pour la rédaction."""

    user_rank: Optional[int] = None


def _article_relevance_int(art: Article) -> Optional[int]:
    raw = art.relevance_score
    if raw is None:
        raw = art.relevance_score_deterministic
    if raw is None:
        return None
    v = float(raw)
    if v <= 1.0:
        return int(round(v * 100))
    return int(round(v))


class EditionSelectionsOut(BaseModel):
    """Articles cochés par sujet (sélection rédactionnelle)."""

    topics: dict[str, list[str]]
    extra_article_ids: list[str] = Field(default_factory=list)
    extra_articles: list[TopicArticlePreviewOut] = Field(default_factory=list)


def _edition_topic_to_out(
    t: EditionTopic,
    *,
    article_count: Optional[int] = None,
    article_previews: Optional[list[TopicArticlePreviewOut]] = None,
) -> EditionTopicOut:
    return EditionTopicOut(
        id=t.id,
        rank=t.rank,
        user_rank=getattr(t, "user_rank", None),
        title_proposed=t.title_proposed,
        title_final=t.title_final,
        status=t.status,
        dominant_angle=t.dominant_angle,
        counter_angle=t.counter_angle,
        editorial_note=t.editorial_note,
        angle_summary=t.angle_summary,
        country_coverage=t.country_coverage,
        generated_text=t.generated_text,
        angle_id=t.angle_id,
        description=t.development_description,
        is_multi_perspective=bool(t.is_multi_perspective),
        countries=list(t.countries) if t.countries else None,
        article_count=article_count,
        article_previews=article_previews,
    )


def _edition_to_out(
    e: Edition,
    *,
    corpus_article_count: Optional[int] = None,
    corpus_country_count: Optional[int] = None,
) -> EditionOut:
    return EditionOut(
        id=e.id,
        publish_date=e.publish_date,
        window_start=e.window_start.isoformat() if e.window_start else "",
        window_end=e.window_end.isoformat() if e.window_end else "",
        timezone=e.timezone,
        target_topics_min=e.target_topics_min,
        target_topics_max=e.target_topics_max,
        status=e.status,
        curator_run_id=e.curator_run_id,
        pipeline_trace_id=e.pipeline_trace_id,
        generated_text=e.generated_text,
        detection_status=getattr(e, "detection_status", "pending") or "pending",
        created_at=e.created_at.isoformat() if e.created_at else None,
        updated_at=e.updated_at.isoformat() if e.updated_at else None,
        corpus_article_count=corpus_article_count,
        corpus_country_count=corpus_country_count,
        compose_instructions_fr=getattr(e, "compose_instructions_fr", None),
    )


def _normalize_extra_article_ids(raw: Any) -> list[str]:
    if not raw or not isinstance(raw, list):
        return []
    out: list[str] = []
    for x in raw:
        s = str(x).strip()
        if s:
            out.append(s)
    return out


def _summary_preview_snippet(art: Article, max_len: int = 400) -> Optional[str]:
    s = (art.summary_fr or "").strip()
    if not s:
        return None
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def _has_full_translation_fr(art: Article) -> bool:
    if bool(getattr(art, "en_translation_summary_only", None)):
        return False
    body = (art.content_translated_fr or "").strip()
    return len(body) >= 120


def _article_to_preview_out(art: Article, ms: MediaSource) -> TopicArticlePreviewOut:
    return TopicArticlePreviewOut(
        id=art.id,
        title_fr=art.title_fr,
        title_original=art.title_original or "",
        media_name=str(ms.name),
        url=art.url or "",
        thesis_summary_fr=art.thesis_summary_fr,
        country=ms.country,
        country_code=ms.country_code,
        editorial_relevance=_article_relevance_int(art),
        article_type=art.article_type,
        source_language=art.source_language,
        author=art.author,
        editorial_angle=art.editorial_angle,
        is_flagship=bool(art.is_flagship),
        analysis_bullets_fr=getattr(art, "analysis_bullets_fr", None),
        summary_fr=_summary_preview_snippet(art),
        has_full_translation_fr=_has_full_translation_fr(art),
    )


async def _extra_previews_for_edition(
    db: AsyncSession,
    edition: Edition,
    extra_ids: list[str],
) -> list[TopicArticlePreviewOut]:
    uuids: list[UUID] = []
    for s in extra_ids:
        try:
            uuids.append(UUID(s))
        except ValueError:
            continue
    if not uuids:
        return []
    stmt = (
        select(Article, MediaSource)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(
            Article.id.in_(uuids),
            sql_article_belongs_to_edition_corpus(edition),
        )
    )
    res = await db.execute(stmt)
    by_id: dict[UUID, tuple[Article, MediaSource]] = {}
    for art, ms in res.all():
        by_id[art.id] = (art, ms)
    out: list[TopicArticlePreviewOut] = []
    for u in uuids:
        pair = by_id.get(u)
        if pair:
            out.append(_article_to_preview_out(pair[0], pair[1]))
    return out


async def _count_corpus_for_edition_window(
    db: AsyncSession,
    edition: Edition,
) -> tuple[int, int]:
    """Articles traduits, non syndiqués, dans la fenêtre d’édition (aligné sujets / journaliste)."""
    stmt = (
        select(
            func.count(Article.id),
            func.count(func.distinct(MediaSource.country_code)),
        )
        .select_from(Article)
        .join(MediaSource, Article.media_source_id == MediaSource.id)
        .where(
            sql_article_belongs_to_edition_corpus(edition),
            Article.status.in_(("translated", "formatted", "needs_review")),
            Article.is_syndicated.is_(False),
        )
    )
    res = await db.execute(stmt)
    row = res.one()
    return int(row[0] or 0), int(row[1] or 0)


@router.get("", response_model=list[EditionOut])
async def list_editions(
    limit: int = Query(default=60, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = select(Edition).order_by(Edition.publish_date.desc()).limit(limit)
    res = await db.execute(stmt)
    rows = res.scalars().all()
    return [_edition_to_out(e) for e in rows]


@router.get("/by-date/{publish_date}", response_model=EditionOut)
async def get_edition_by_date(
    publish_date: date,
    db: AsyncSession = Depends(get_db),
) -> Any:
    e = await find_edition_for_calendar_date(db, publish_date)
    if not e:
        e = await ensure_edition_for_publish_date(db, publish_date)
        await db.commit()
        await db.refresh(e)
    n_art, n_cc = await _count_corpus_for_edition_window(db, e)
    return _edition_to_out(
        e,
        corpus_article_count=n_art,
        corpus_country_count=n_cc,
    )


@router.get("/{edition_id}", response_model=EditionOut)
async def get_edition(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    return _edition_to_out(e)


@router.get("/{edition_id}/selections", response_model=EditionSelectionsOut)
async def get_edition_selections(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Liste des articles sélectionnés par sujet (pour reprise après rechargement)."""
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    stmt = (
        select(EditionTopicArticle.edition_topic_id, EditionTopicArticle.article_id)
        .join(EditionTopic, EditionTopicArticle.edition_topic_id == EditionTopic.id)
        .where(
            EditionTopic.edition_id == edition_id,
            EditionTopicArticle.is_selected.is_(True),
        )
        .order_by(
            EditionTopicArticle.edition_topic_id,
            EditionTopicArticle.display_order.asc().nullslast(),
            EditionTopicArticle.article_id,
        )
    )
    res = await db.execute(stmt)
    by_topic: dict[str, list[str]] = defaultdict(list)
    for tid, aid in res.all():
        by_topic[str(tid)].append(str(aid))
    extra_raw = getattr(e, "extra_selected_article_ids", None)
    extra_ids = _normalize_extra_article_ids(extra_raw)
    extra_prev = await _extra_previews_for_edition(db, e, extra_ids)
    return EditionSelectionsOut(
        topics=dict(by_topic),
        extra_article_ids=extra_ids,
        extra_articles=extra_prev,
    )


@router.patch("/{edition_id}/compose-preferences")
async def patch_compose_preferences(
    edition_id: UUID,
    body: ComposePreferencesPatch,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    """Sélections complémentaires (regroupements) + consignes LLM pour la page Rédaction."""
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    data = body.model_dump(exclude_unset=True)
    if "extra_selected_article_ids" in data:
        ids = body.extra_selected_article_ids or []
        if ids:
            stmt = (
                select(func.count(Article.id))
                .select_from(Article)
                .where(
                    Article.id.in_(ids),
                    sql_article_belongs_to_edition_corpus(e),
                )
            )
            n = int((await db.execute(stmt)).scalar_one() or 0)
            if n != len(set(ids)):
                raise HTTPException(
                    status_code=400,
                    detail="Un ou plusieurs articles ne font pas partie du corpus de cette édition.",
                )
        e.extra_selected_article_ids = [str(x) for x in ids]
    if "compose_instructions_fr" in data:
        e.compose_instructions_fr = body.compose_instructions_fr
    await db.commit()
    await db.refresh(e)
    return {"status": "ok"}


@router.get("/{edition_id}/topics", response_model=list[EditionTopicOut])
async def list_edition_topics(
    edition_id: UUID,
    include_article_previews: bool = Query(
        default=False,
        description="Inclut article_count et des aperçus enrichis par sujet.",
    ),
    max_article_previews_per_topic: int = Query(
        default=TOPIC_ARTICLE_PREVIEW_DEFAULT,
        ge=1,
        le=TOPIC_ARTICLE_PREVIEW_MAX,
        description="Nombre max d’aperçus par sujet (sommaire : 6–12 ; fiche : plus).",
    ),
    db: AsyncSession = Depends(get_db),
) -> Any:
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    stmt = (
        select(EditionTopic)
        .where(EditionTopic.edition_id == edition_id)
        .order_by(
            EditionTopic.user_rank.asc().nullslast(),
            EditionTopic.rank.asc(),
        )
    )
    res = await db.execute(stmt)
    rows = list(res.scalars().all())

    preview_by_topic: dict[UUID, tuple[int, list[TopicArticlePreviewOut]]] = {}
    if include_article_previews and rows:
        topic_ids = [t.id for t in rows]
        jstmt = (
            select(EditionTopicArticle, Article, MediaSource)
            .join(Article, EditionTopicArticle.article_id == Article.id)
            .join(MediaSource, Article.media_source_id == MediaSource.id)
            .where(EditionTopicArticle.edition_topic_id.in_(topic_ids))
        )
        jres = await db.execute(jstmt)

        grouped: dict[
            UUID,
            list[tuple[Optional[int], Optional[int], Article, MediaSource]],
        ] = defaultdict(list)
        for link, art, src in jres.all():
            grouped[link.edition_topic_id].append(
                (
                    link.display_order,
                    link.rank_in_topic,
                    art,
                    src,
                ),
            )
        for tid, items in grouped.items():
            items.sort(
                key=lambda x: (
                    x[0] if x[0] is not None else 999,
                    x[1] if x[1] is not None else 999,
                    str(x[2].id),
                ),
            )
            count = len(items)
            prev_slice = items[:max_article_previews_per_topic]
            previews = [
                TopicArticlePreviewOut(
                    id=a.id,
                    title_fr=a.title_fr,
                    title_original=a.title_original,
                    media_name=str(ms.name),
                    url=a.url,
                    thesis_summary_fr=a.thesis_summary_fr,
                    country=ms.country,
                    country_code=ms.country_code,
                    editorial_relevance=_article_relevance_int(a),
                    article_type=a.article_type,
                    source_language=a.source_language,
                    author=a.author,
                    editorial_angle=a.editorial_angle,
                    is_flagship=bool(a.is_flagship),
                    analysis_bullets_fr=getattr(a, "analysis_bullets_fr", None),
                    summary_fr=_summary_preview_snippet(a),
                    has_full_translation_fr=_has_full_translation_fr(a),
                    collected_at=a.collected_at,
                )
                for _do, _rnk, a, ms in prev_slice
            ]
            preview_by_topic[tid] = (count, previews)

    out: list[EditionTopicOut] = []
    for t in rows:
        if include_article_previews:
            cnt, prev = preview_by_topic.get(t.id, (0, []))
            out.append(_edition_topic_to_out(t, article_count=cnt, article_previews=prev))
        else:
            out.append(_edition_topic_to_out(t))
    return out


@router.get("/{edition_id}/topics/{topic_id}")
async def get_edition_topic(
    edition_id: UUID,
    topic_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    et = await db.get(EditionTopic, topic_id)
    if not et or et.edition_id != edition_id:
        raise HTTPException(status_code=404, detail="Topic not found")
    stmt = (
        select(EditionTopicArticle, Article)
        .join(Article, EditionTopicArticle.article_id == Article.id)
        .where(EditionTopicArticle.edition_topic_id == topic_id)
        .order_by(EditionTopicArticle.display_order.asc().nullslast())
    )
    res = await db.execute(stmt)
    pairs = list(res.all())
    pairs.sort(
        key=lambda p: (
            p[0].display_order if p[0].display_order is not None else 999,
            p[0].rank_in_topic if p[0].rank_in_topic is not None else 999,
            str(p[1].id),
        ),
    )
    refs = [
        TopicArticleRef(
            article_id=link.article_id,
            is_selected=link.is_selected,
            is_recommended=link.is_recommended,
            rank_in_topic=link.rank_in_topic,
            fit_confidence=link.fit_confidence,
            perspective_rarity=link.perspective_rarity,
            display_order=link.display_order,
        )
        for link, _art in pairs
    ]
    article_ids = [str(a.id) for _link, a in pairs]
    return {
        "topic": _edition_topic_to_out(et).model_dump(),
        "article_ids": article_ids,
        "article_refs": [r.model_dump() for r in refs],
    }


@router.patch("/{edition_id}/topics/{topic_id}", response_model=EditionTopicOut)
async def patch_edition_topic(
    edition_id: UUID,
    topic_id: UUID,
    body: EditionTopicPatchBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    et = await db.get(EditionTopic, topic_id)
    if not et or et.edition_id != edition_id:
        raise HTTPException(status_code=404, detail="Topic not found")
    data = body.model_dump(exclude_unset=True)
    if "user_rank" in data:
        et.user_rank = data["user_rank"]
    await db.commit()
    await db.refresh(et)
    return _edition_topic_to_out(et)


@router.patch("/{edition_id}/topics/{topic_id}/selection")
async def patch_topic_selection(
    edition_id: UUID,
    topic_id: UUID,
    body: TopicSelectionBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    et = await db.get(EditionTopic, topic_id)
    if not et or et.edition_id != edition_id:
        raise HTTPException(status_code=404, detail="Topic not found")
    stmt = select(EditionTopicArticle).where(
        EditionTopicArticle.edition_topic_id == topic_id,
    )
    res = await db.execute(stmt)
    links = list(res.scalars().all())
    if not links:
        raise HTTPException(status_code=400, detail="No articles linked to topic")
    link_ids = {link.article_id for link in links}
    ordered_unique = _dedupe_uuid_preserve_order(body.selected_article_ids)
    ordered_in_topic = [aid for aid in ordered_unique if aid in link_ids]
    order_map = {aid: idx for idx, aid in enumerate(ordered_in_topic)}
    selected_set = set(ordered_in_topic)
    for link in links:
        aid = link.article_id
        link.is_selected = aid in selected_set
        if link.is_selected:
            link.display_order = order_map.get(aid)
        else:
            link.display_order = None
    sel_list = list(ordered_in_topic)
    unsel_list = [link.article_id for link in links if link.article_id not in selected_set]
    await apply_retention_for_selected_article_ids(db, sel_list)
    await clear_retention_if_unselected(db, unsel_list)
    await db.commit()
    return {"status": "ok", "updated": len(links)}


@router.post("/{edition_id}/topics/{topic_id}/generate")
async def post_generate_topic(
    edition_id: UUID,
    topic_id: UUID,
    body: GenerateTopicBody | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    ids = body.article_ids if body and body.article_ids else None
    instr = body.instruction_suffix if body else None
    return await generate_edition_topic_review(
        db,
        edition_id,
        topic_id,
        article_ids=ids,
        instruction_suffix=instr,
    )


@router.post("/{edition_id}/generate-all")
async def post_generate_all(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    return await generate_all_edition_topics(db, edition_id)


@router.post("/{edition_id}/curate")
async def trigger_curate(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    return await run_curator_for_edition(db, edition_id)


@router.get("/{edition_id}/pipeline-diagnostic")
async def get_edition_pipeline_diagnostic(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    """Couverture corpus vs fenêtre d’édition ; pistes « collecte » vs « pipeline seulement » (clé interne)."""
    payload = await build_edition_pipeline_diagnostic(db, edition_id)
    if payload.get("error") == "edition_not_found":
        raise HTTPException(status_code=404, detail="Edition not found")
    return payload


@router.post("/{edition_id}/detect-topics")
async def post_detect_topics(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    """Relance la détection LLM des sujets (développements) pour cette édition."""
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    topics_created = await run_topic_detection_for_edition_id(db, edition_id)
    await db.refresh(e)
    return {
        "status": "ok",
        "topics_created": topics_created,
        "detection_status": getattr(e, "detection_status", "pending"),
    }


@router.post("/{edition_id}/analyze")
async def post_analyze_edition(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
    force: bool = Query(
        True,
        description="Si vrai : ré-analyse les articles déjà analysés (ex. après traduction corps complet).",
    ),
    _: None = Depends(require_internal_key),
) -> Any:
    """Relance l’analyse experte (bullets, thèse, faits) pour le corpus de cette édition."""
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    from src.services.article_analyst import run_article_analysis_pipeline

    return await run_article_analysis_pipeline(edition_id=edition_id, force=force)


@router.get("/{edition_id}/clusters-fallback")
async def clusters_fallback(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    return await list_clusters_fallback_for_edition(db, edition_id)


@router.patch("/{edition_id}", response_model=EditionOut)
async def patch_edition(
    edition_id: UUID,
    body: EditionPatch,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(e, k, v)
    await db.commit()
    await db.refresh(e)
    return _edition_to_out(e)


@router.post("/custom", response_model=EditionOut)
async def create_custom_edition(
    body: CreateCustomEditionBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    """Crée une édition avec fenêtre de collecte arbitraire (pas liée au schedule standard)."""
    from datetime import timezone as dttz

    ws = body.window_start if body.window_start.tzinfo else body.window_start.replace(tzinfo=dttz.utc)
    we = body.window_end if body.window_end.tzinfo else body.window_end.replace(tzinfo=dttz.utc)
    if we <= ws:
        raise HTTPException(status_code=400, detail="window_end doit être postérieur à window_start.")

    ed = Edition(
        publish_date=body.publish_date,
        window_start=ws.astimezone(dttz.utc),
        window_end=we.astimezone(dttz.utc),
        timezone="Asia/Beirut",
        status="CUSTOM",
    )
    if body.label:
        ed.compose_instructions_fr = body.label
    db.add(ed)
    await db.flush()
    n_art, n_cc = await _count_corpus_for_edition_window(db, ed)
    await db.commit()
    await db.refresh(ed)
    return _edition_to_out(ed, corpus_article_count=n_art, corpus_country_count=n_cc)


@router.post("/{edition_id}/run-custom-pipeline")
async def run_custom_edition_pipeline(
    edition_id: UUID,
    body: CustomEditionPipelineBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> Any:
    """Exécute analyse + détection sujets pour une édition (custom ou standard).

    Utile pour régénérer les sujets d'une édition passée ou d'une édition à période custom.
    """
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    results: dict[str, Any] = {"edition_id": str(edition_id)}

    if body.run_analysis:
        from src.services.article_analyst import run_article_analysis_pipeline
        analysis_result = await run_article_analysis_pipeline(
            edition_id=edition_id, force=body.analysis_force
        )
        results["analysis"] = analysis_result

    if body.run_topic_detection:
        topics_created = await run_topic_detection_for_edition_id(db, edition_id)
        await db.refresh(e)
        results["topics_created"] = topics_created
        results["detection_status"] = getattr(e, "detection_status", "pending")

    return results
