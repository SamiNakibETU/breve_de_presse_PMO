"""API MEMW v2 — Éditions."""

import json
import time
from datetime import date
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models.article import Article
from src.models.edition import Edition, EditionTopic, EditionTopicArticle
from src.services.curator_service import (
    list_clusters_fallback_for_edition,
    run_curator_for_edition,
)
from src.services.edition_review_generator import (
    generate_all_edition_topics,
    generate_edition_topic_review,
)
from src.services.edition_schedule import find_edition_for_calendar_date

router = APIRouter(prefix="/api/editions", tags=["editions"])


# #region agent log
def _agent_debug_log(hypothesis_id: str, location: str, message: str, data: dict) -> None:
    try:
        p = Path(__file__).resolve().parents[3] / "debug-8e42d9.log"
        line = json.dumps(
            {
                "sessionId": "8e42d9",
                "hypothesisId": hypothesis_id,
                "location": location,
                "message": message,
                "data": data,
                "timestamp": int(time.time() * 1000),
            },
            ensure_ascii=False,
        )
        with p.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# #endregion


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
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class EditionPatch(BaseModel):
    status: Optional[str] = None
    generated_text: Optional[str] = None
    pipeline_trace_id: Optional[UUID] = None
    curator_run_id: Optional[UUID] = None


class EditionTopicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rank: int
    title_proposed: str
    title_final: Optional[str] = None
    status: str
    dominant_angle: Optional[str] = None
    counter_angle: Optional[str] = None
    editorial_note: Optional[str] = None
    country_coverage: Optional[dict[str, Any]] = None
    generated_text: Optional[str] = None


class TopicArticleRef(BaseModel):
    article_id: UUID
    is_selected: bool
    is_recommended: bool
    rank_in_topic: Optional[int] = None


class TopicSelectionBody(BaseModel):
    """Liste d'articles inclus dans la rédaction pour ce sujet."""

    selected_article_ids: list[UUID]


class GenerateTopicBody(BaseModel):
    article_ids: Optional[list[UUID]] = None


def _edition_to_out(e: Edition) -> EditionOut:
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
        created_at=e.created_at.isoformat() if e.created_at else None,
        updated_at=e.updated_at.isoformat() if e.updated_at else None,
    )


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
    # #region agent log
    _agent_debug_log(
        "H1",
        "editions.py:get_edition_by_date",
        "incoming calendar date",
        {"publish_date": str(publish_date), "weekday": publish_date.weekday()},
    )
    # #endregion
    e = await find_edition_for_calendar_date(db, publish_date)
    # #region agent log
    _agent_debug_log(
        "H2",
        "editions.py:get_edition_by_date",
        "after find_edition_for_calendar_date",
        {
            "found": e is not None,
            "resolved_publish_date": str(e.publish_date) if e else None,
        },
    )
    # #endregion
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found for this date")
    return _edition_to_out(e)


@router.get("/{edition_id}", response_model=EditionOut)
async def get_edition(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    return _edition_to_out(e)


@router.get("/{edition_id}/topics", response_model=list[EditionTopicOut])
async def list_edition_topics(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    e = await db.get(Edition, edition_id)
    if not e:
        raise HTTPException(status_code=404, detail="Edition not found")
    stmt = (
        select(EditionTopic)
        .where(EditionTopic.edition_id == edition_id)
        .order_by(EditionTopic.rank.asc())
    )
    res = await db.execute(stmt)
    rows = res.scalars().all()
    return [
        EditionTopicOut(
            id=t.id,
            rank=t.rank,
            title_proposed=t.title_proposed,
            title_final=t.title_final,
            status=t.status,
            dominant_angle=t.dominant_angle,
            counter_angle=t.counter_angle,
            editorial_note=t.editorial_note,
            country_coverage=t.country_coverage,
            generated_text=t.generated_text,
        )
        for t in rows
    ]


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
        .order_by(EditionTopicArticle.rank_in_topic.asc())
    )
    res = await db.execute(stmt)
    pairs = list(res.all())
    pairs.sort(
        key=lambda p: (
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
        )
        for link, _art in pairs
    ]
    article_ids = [str(a.id) for _link, a in pairs]
    return {
        "topic": EditionTopicOut(
            id=et.id,
            rank=et.rank,
            title_proposed=et.title_proposed,
            title_final=et.title_final,
            status=et.status,
            dominant_angle=et.dominant_angle,
            counter_angle=et.counter_angle,
            editorial_note=et.editorial_note,
            country_coverage=et.country_coverage,
            generated_text=et.generated_text,
        ).model_dump(),
        "article_ids": article_ids,
        "article_refs": [r.model_dump() for r in refs],
    }


@router.patch("/{edition_id}/topics/{topic_id}/selection")
async def patch_topic_selection(
    edition_id: UUID,
    topic_id: UUID,
    body: TopicSelectionBody,
    db: AsyncSession = Depends(get_db),
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
    selected = set(body.selected_article_ids)
    for link in links:
        link.is_selected = link.article_id in selected
    await db.commit()
    return {"status": "ok", "updated": len(links)}


@router.post("/{edition_id}/topics/{topic_id}/generate")
async def post_generate_topic(
    edition_id: UUID,
    topic_id: UUID,
    body: GenerateTopicBody | None = None,
    db: AsyncSession = Depends(get_db),
) -> Any:
    ids = body.article_ids if body and body.article_ids else None
    return await generate_edition_topic_review(db, edition_id, topic_id, article_ids=ids)


@router.post("/{edition_id}/generate-all")
async def post_generate_all(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    return await generate_all_edition_topics(db, edition_id)


@router.post("/{edition_id}/curate")
async def trigger_curate(
    edition_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    return await run_curator_for_edition(db, edition_id)


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
