"""API régie — journaux pipeline / LLM (auth Bearer), feedback déduplication."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
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
from src.models.provider_usage_event import ProviderUsageEvent
from src.models.usage_event import UsageEvent

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
    provider: Optional[str] = None
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
                provider=r.provider,
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


class AnalyticsUsageDayRow(BaseModel):
    day: str
    request_count: int


class AnalyticsUsagePathRow(BaseModel):
    path_template: str
    request_count: int


class AnalyticsProviderByDayRow(BaseModel):
    day: str
    call_count: int
    cost_usd: float
    input_units: int
    output_units: int


class AnalyticsProviderByOperationRow(BaseModel):
    operation: str
    kind: str
    call_count: int
    cost_usd: float
    input_units: int
    output_units: int


class AnalyticsProviderByProviderRow(BaseModel):
    provider: str
    kind: str
    call_count: int
    cost_usd: float
    input_units: int
    output_units: int


class AnalyticsProviderByModelRow(BaseModel):
    provider: str
    model: str
    kind: str
    call_count: int
    cost_usd: float
    input_units: int
    output_units: int


class AnalyticsProviderRecentRow(BaseModel):
    id: UUID
    created_at: str
    kind: str
    provider: str
    model: str
    operation: str
    status: str
    cost_usd_est: float
    input_units: int
    output_units: int
    duration_ms: Optional[int] = None
    article_id: Optional[UUID] = None
    edition_id: Optional[UUID] = None
    edition_topic_id: Optional[UUID] = None


class AnalyticsSummaryResponse(BaseModel):
    period_days: int
    since_iso: str
    usage_total: int
    usage_by_day: list[AnalyticsUsageDayRow]
    usage_top_paths: list[AnalyticsUsagePathRow]
    provider_total_calls: int
    provider_total_cost_usd: float
    provider_total_input_units: int
    provider_total_output_units: int
    provider_by_day: list[AnalyticsProviderByDayRow]
    provider_by_operation: list[AnalyticsProviderByOperationRow]
    provider_by_provider: list[AnalyticsProviderByProviderRow]
    provider_by_model: list[AnalyticsProviderByModelRow]
    provider_recent: list[AnalyticsProviderRecentRow]
    note_fr: str


@router.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
async def analytics_summary(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> AnalyticsSummaryResponse:
    from sqlalchemy import cast, Date

    since = datetime.now(timezone.utc) - timedelta(days=days)

    # ---- Usage events : GROUP BY en SQL ----
    uday_res = await db.execute(
        select(
            cast(UsageEvent.created_at, Date).label("day"),
            func.count().label("cnt"),
        )
        .where(UsageEvent.created_at >= since)
        .group_by(cast(UsageEvent.created_at, Date))
        .order_by(cast(UsageEvent.created_at, Date))
    )
    usage_day_list = [
        AnalyticsUsageDayRow(day=str(row.day), request_count=int(row.cnt))
        for row in uday_res.all()
    ]

    upath_res = await db.execute(
        select(
            UsageEvent.path_template,
            func.count().label("cnt"),
        )
        .where(UsageEvent.created_at >= since)
        .group_by(UsageEvent.path_template)
        .order_by(func.count().desc())
        .limit(20)
    )
    usage_path_list = [
        AnalyticsUsagePathRow(path_template=row.path_template, request_count=int(row.cnt))
        for row in upath_res.all()
    ]

    # ---- Provider usage : GROUP BY en SQL ----
    pday_res = await db.execute(
        select(
            cast(ProviderUsageEvent.created_at, Date).label("day"),
            func.count().label("call_count"),
            func.coalesce(func.sum(ProviderUsageEvent.cost_usd_est), 0.0).label("cost_usd"),
            func.coalesce(func.sum(ProviderUsageEvent.input_units), 0).label("input_units"),
            func.coalesce(func.sum(ProviderUsageEvent.output_units), 0).label("output_units"),
        )
        .where(ProviderUsageEvent.created_at >= since)
        .group_by(cast(ProviderUsageEvent.created_at, Date))
        .order_by(cast(ProviderUsageEvent.created_at, Date))
    )
    provider_day_list = [
        AnalyticsProviderByDayRow(
            day=str(row.day),
            call_count=int(row.call_count),
            cost_usd=round(float(row.cost_usd), 6),
            input_units=int(row.input_units),
            output_units=int(row.output_units),
        )
        for row in pday_res.all()
    ]

    pop_res = await db.execute(
        select(
            ProviderUsageEvent.operation,
            ProviderUsageEvent.kind,
            func.count().label("call_count"),
            func.coalesce(func.sum(ProviderUsageEvent.cost_usd_est), 0.0).label("cost_usd"),
            func.coalesce(func.sum(ProviderUsageEvent.input_units), 0).label("input_units"),
            func.coalesce(func.sum(ProviderUsageEvent.output_units), 0).label("output_units"),
        )
        .where(ProviderUsageEvent.created_at >= since)
        .group_by(ProviderUsageEvent.operation, ProviderUsageEvent.kind)
        .order_by(func.sum(ProviderUsageEvent.cost_usd_est).desc())
    )
    provider_op_list = [
        AnalyticsProviderByOperationRow(
            operation=row.operation,
            kind=row.kind,
            call_count=int(row.call_count),
            cost_usd=round(float(row.cost_usd), 6),
            input_units=int(row.input_units),
            output_units=int(row.output_units),
        )
        for row in pop_res.all()
    ]

    pprov_res = await db.execute(
        select(
            ProviderUsageEvent.provider,
            ProviderUsageEvent.kind,
            func.count().label("call_count"),
            func.coalesce(func.sum(ProviderUsageEvent.cost_usd_est), 0.0).label("cost_usd"),
            func.coalesce(func.sum(ProviderUsageEvent.input_units), 0).label("input_units"),
            func.coalesce(func.sum(ProviderUsageEvent.output_units), 0).label("output_units"),
        )
        .where(ProviderUsageEvent.created_at >= since)
        .group_by(ProviderUsageEvent.provider, ProviderUsageEvent.kind)
        .order_by(func.sum(ProviderUsageEvent.cost_usd_est).desc())
    )
    provider_prov_list = [
        AnalyticsProviderByProviderRow(
            provider=row.provider,
            kind=row.kind,
            call_count=int(row.call_count),
            cost_usd=round(float(row.cost_usd), 6),
            input_units=int(row.input_units),
            output_units=int(row.output_units),
        )
        for row in pprov_res.all()
    ]

    pmod_res = await db.execute(
        select(
            ProviderUsageEvent.provider,
            ProviderUsageEvent.model,
            ProviderUsageEvent.kind,
            func.count().label("call_count"),
            func.coalesce(func.sum(ProviderUsageEvent.cost_usd_est), 0.0).label("cost_usd"),
            func.coalesce(func.sum(ProviderUsageEvent.input_units), 0).label("input_units"),
            func.coalesce(func.sum(ProviderUsageEvent.output_units), 0).label("output_units"),
        )
        .where(ProviderUsageEvent.created_at >= since)
        .group_by(ProviderUsageEvent.provider, ProviderUsageEvent.model, ProviderUsageEvent.kind)
        .order_by(func.sum(ProviderUsageEvent.cost_usd_est).desc())
    )
    provider_model_list = [
        AnalyticsProviderByModelRow(
            provider=row.provider,
            model=row.model,
            kind=row.kind,
            call_count=int(row.call_count),
            cost_usd=round(float(row.cost_usd), 6),
            input_units=int(row.input_units),
            output_units=int(row.output_units),
        )
        for row in pmod_res.all()
    ]

    # Totaux agrégés
    ptot_res = await db.execute(
        select(
            func.coalesce(func.sum(ProviderUsageEvent.cost_usd_est), 0.0).label("cost_usd"),
            func.coalesce(func.sum(ProviderUsageEvent.input_units), 0).label("input_units"),
            func.coalesce(func.sum(ProviderUsageEvent.output_units), 0).label("output_units"),
        )
        .where(ProviderUsageEvent.created_at >= since)
    )
    ptot = ptot_res.one()
    p_total_cost = float(ptot.cost_usd)
    p_in = int(ptot.input_units)
    p_out = int(ptot.output_units)

    # Recent rows (100 derniers)
    recent_res = await db.execute(
        select(ProviderUsageEvent)
        .where(ProviderUsageEvent.created_at >= since)
        .order_by(ProviderUsageEvent.created_at.desc())
        .limit(100)
    )
    recent_list = [
        AnalyticsProviderRecentRow(
            id=r.id,
            created_at=_iso(r.created_at),
            kind=r.kind,
            provider=r.provider,
            model=r.model,
            operation=r.operation,
            status=r.status,
            cost_usd_est=round(float(r.cost_usd_est or 0.0), 6),
            input_units=int(r.input_units or 0),
            output_units=int(r.output_units or 0),
            duration_ms=r.duration_ms,
            article_id=r.article_id,
            edition_id=r.edition_id,
            edition_topic_id=r.edition_topic_id,
        )
        for r in recent_res.scalars().all()
    ]

    usage_total = sum(r.request_count for r in usage_day_list)
    provider_total_calls = sum(r.call_count for r in provider_day_list)

    return AnalyticsSummaryResponse(
        period_days=days,
        since_iso=since.isoformat(),
        usage_total=usage_total,
        usage_by_day=usage_day_list,
        usage_top_paths=usage_path_list,
        provider_total_calls=provider_total_calls,
        provider_total_cost_usd=round(p_total_cost, 6),
        provider_total_input_units=p_in,
        provider_total_output_units=p_out,
        provider_by_day=provider_day_list,
        provider_by_operation=provider_op_list,
        provider_by_provider=provider_prov_list,
        provider_by_model=provider_model_list,
        provider_recent=recent_list,
        note_fr=(
            "Ledger unifié `provider_usage_events` : traduction, embeddings Cohere, curateur, revue, "
            "détection sujets, scoring pertinence, libellés clusters, gate ingestion. Coûts et unités "
            "sont estimés (pas facture API). Pour la facture réelle, utilisez les consoles fournisseurs "
            "ou l’API Usage & Cost admin Anthropic (clé admin). Railway ne regroupe pas les coûts LLM. "
            "Exclut les appels passant uniquement par `generator.py` (règle projet : fichier non modifié)."
        ),
    )


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
