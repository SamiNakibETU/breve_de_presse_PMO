"""API régie — logs pipeline / LLM (auth Bearer), feedback dédup (MEMW Sprint 8)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.deps.auth import require_internal_key
from src.models.article import Article
from src.models.dedup_feedback import DedupFeedback
from src.models.edition import LLMCallLog, PipelineDebugLog

router = APIRouter(prefix="/api/regie", tags=["regie"])


class PipelineDebugLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    edition_id: Optional[UUID] = None
    step: str
    payload: dict[str, Any]
    created_at: str


class PipelineDebugLogsResponse(BaseModel):
    items: list[PipelineDebugLogItem]
    total: int


class LLMCallLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    edition_id: Optional[UUID] = None
    prompt_id: str
    prompt_version: str
    model_used: str
    temperature: float
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    latency_ms: Optional[int] = None
    cost_usd: Optional[float] = None
    has_validation_error: bool = False
    output_raw_preview: Optional[str] = None
    created_at: str


class LLMCallLogsResponse(BaseModel):
    items: list[LLMCallLogItem]
    total: int


def _iso(dt: datetime | None) -> str:
    return dt.isoformat() if dt else ""


@router.get("/pipeline-debug-logs", response_model=PipelineDebugLogsResponse)
async def list_pipeline_debug_logs(
    edition_id: Optional[UUID] = Query(None),
    step: Optional[str] = Query(
        None,
        description="Filtre exact sur pipeline_debug_logs.step",
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> PipelineDebugLogsResponse:
    base = select(PipelineDebugLog)
    count_q = select(func.count()).select_from(PipelineDebugLog)
    if edition_id is not None:
        base = base.where(PipelineDebugLog.edition_id == edition_id)
        count_q = count_q.where(PipelineDebugLog.edition_id == edition_id)
    if step:
        base = base.where(PipelineDebugLog.step == step)
        count_q = count_q.where(PipelineDebugLog.step == step)

    total_res = await db.execute(count_q)
    total = int(total_res.scalar_one())

    stmt = (
        base.order_by(PipelineDebugLog.created_at.desc()).limit(limit).offset(offset)
    )
    res = await db.execute(stmt)
    rows = res.scalars().all()
    items = [
        PipelineDebugLogItem(
            id=r.id,
            edition_id=r.edition_id,
            step=r.step,
            payload=dict(r.payload) if r.payload else {},
            created_at=_iso(r.created_at),
        )
        for r in rows
    ]
    return PipelineDebugLogsResponse(items=items, total=total)


@router.get("/llm-call-logs", response_model=LLMCallLogsResponse)
async def list_llm_call_logs(
    edition_id: Optional[UUID] = Query(None),
    prompt_id: Optional[str] = Query(
        None,
        description="Filtre par préfixe ou égalité sur prompt_id (ex. curator_v2)",
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    include_raw: bool = Query(
        False,
        description="Si vrai, inclut un extrait plus long de output_raw dans output_raw_preview",
    ),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> LLMCallLogsResponse:
    base = select(LLMCallLog)
    count_q = select(func.count()).select_from(LLMCallLog)
    if edition_id is not None:
        base = base.where(LLMCallLog.edition_id == edition_id)
        count_q = count_q.where(LLMCallLog.edition_id == edition_id)
    if prompt_id:
        base = base.where(LLMCallLog.prompt_id == prompt_id)
        count_q = count_q.where(LLMCallLog.prompt_id == prompt_id)

    total_res = await db.execute(count_q)
    total = int(total_res.scalar_one())

    stmt = base.order_by(LLMCallLog.created_at.desc()).limit(limit).offset(offset)
    res = await db.execute(stmt)
    rows = res.scalars().all()
    max_raw = 800 if include_raw else 200
    items: list[LLMCallLogItem] = []
    for r in rows:
        raw = (r.output_raw or "").strip()
        preview = raw[:max_raw] + ("…" if len(raw) > max_raw else "") if raw else None
        items.append(
            LLMCallLogItem(
                id=r.id,
                edition_id=r.edition_id,
                prompt_id=r.prompt_id,
                prompt_version=r.prompt_version,
                model_used=r.model_used,
                temperature=float(r.temperature),
                input_tokens=r.input_tokens,
                output_tokens=r.output_tokens,
                latency_ms=r.latency_ms,
                cost_usd=float(r.cost_usd) if r.cost_usd is not None else None,
                has_validation_error=bool(r.validation_errors),
                output_raw_preview=preview,
                created_at=_iso(r.created_at),
            )
        )
    return LLMCallLogsResponse(items=items, total=total)


class DedupFeedbackCreate(BaseModel):
    article_id: UUID
    note: str = Field(..., min_length=1, max_length=8000)


class DedupFeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    article_id: UUID
    note: str
    created_at: str


@router.post("/dedup-feedback", response_model=DedupFeedbackOut)
async def create_dedup_feedback(
    body: DedupFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> DedupFeedbackOut:
    art = await db.get(Article, body.article_id)
    if not art:
        raise HTTPException(status_code=404, detail="Article introuvable")
    row = DedupFeedback(article_id=body.article_id, note=body.note.strip())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return DedupFeedbackOut(
        id=row.id,
        article_id=row.article_id,
        note=row.note,
        created_at=_iso(row.created_at),
    )


@router.get("/dedup-feedback", response_model=list[DedupFeedbackOut])
async def list_dedup_feedback(
    limit: int = Query(40, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> list[DedupFeedbackOut]:
    stmt = (
        select(DedupFeedback)
        .order_by(DedupFeedback.created_at.desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    rows = res.scalars().all()
    return [
        DedupFeedbackOut(
            id=r.id,
            article_id=r.article_id,
            note=r.note,
            created_at=_iso(r.created_at),
        )
        for r in rows
    ]
