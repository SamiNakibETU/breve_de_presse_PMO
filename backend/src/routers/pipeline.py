from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request

from typing import Optional

from src.config import get_settings
from src.deps.auth import require_internal_key
from src.limiter import limiter
from src.schemas.pipeline import (
    PipelineResumeStatusResponse,
    PipelineTaskStartRequest,
    PipelineTaskStartResponse,
)
from src.services import pipeline_task_store
from src.services.collector import run_collection
from src.services.pipeline_async_jobs import (
    execute_pipeline_chain_task,
    execute_pipeline_task,
)
from src.services.scheduler import (
    PipelineBusyError,
    pipeline_is_busy_async,
    run_daily_pipeline,
)
from src.services.translator import run_translation_pipeline

router = APIRouter(prefix="/api")


@router.post("/collect")
@limiter.limit("12/minute")
async def trigger_collect(
    request: Request,
    _: None = Depends(require_internal_key),
):
    try:
        stats = await run_collection()
        return {"status": "ok", "stats": stats}
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


@router.post("/translate")
@limiter.limit("8/minute")
async def trigger_translate(
    request: Request,
    limit: Optional[int] = Query(
        default=None,
        ge=1,
        le=1000,
        description="Plafond par passage ; omis = TRANSLATION_PIPELINE_BATCH_LIMIT",
    ),
    _: None = Depends(require_internal_key),
):
    try:
        lim = limit if limit is not None else get_settings().translation_pipeline_batch_limit
        stats = await run_translation_pipeline(limit=lim)
        return {"status": "ok", "stats": stats}
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


@router.post("/pipeline")
@limiter.limit("4/minute")
async def trigger_pipeline(
    request: Request,
    _: None = Depends(require_internal_key),
):
    try:
        stats = await run_daily_pipeline(trigger="http_sync")
        return {"status": "ok", "stats": stats}
    except PipelineBusyError as exc:
        raise HTTPException(
            status_code=409,
            detail="Un pipeline complet est déjà en cours (planificateur ou autre session).",
        ) from exc
    except Exception as exc:
        raise HTTPException(500, detail=str(exc)) from exc


@router.post("/pipeline/resume")
@limiter.limit("4/minute")
async def trigger_pipeline_resume(
    request: Request,
    _: None = Depends(require_internal_key),
):
    """
    Relance le pipeline quotidien avec reprise : saute collecte et/ou traduction si déjà
    journalisées ce jour (Asia/Beirut) pour l’édition courante.
    """
    try:
        stats = await run_daily_pipeline(trigger="http_sync_resume", resume=True)
        return {"status": "ok", "stats": stats}
    except PipelineBusyError as exc:
        raise HTTPException(
            status_code=409,
            detail="Un pipeline complet est déjà en cours (planificateur ou autre session).",
        ) from exc
    except Exception as exc:
        raise HTTPException(500, detail=str(exc)) from exc


@router.get("/pipeline/resume-status", response_model=PipelineResumeStatusResponse)
@limiter.limit("30/minute")
async def pipeline_resume_status(
    request: Request,
    _: None = Depends(require_internal_key),
):
    from src.services.pipeline_debug_log import resolve_current_edition_id
    from src.services.pipeline_resume import load_resume_snapshot_for_edition

    eid = await resolve_current_edition_id()
    snap = await load_resume_snapshot_for_edition(eid)
    return PipelineResumeStatusResponse(
        edition_id=str(snap.edition_id) if snap.edition_id else None,
        has_collect=snap.has_collect,
        has_translate=snap.has_translate,
        has_pipeline_summary=snap.has_pipeline_summary,
        skip_collect=snap.skip_collect,
        skip_translate=snap.skip_translate,
        beirut_day=snap.beirut_day.isoformat(),
    )


@router.post("/pipeline/tasks", response_model=PipelineTaskStartResponse)
@limiter.limit("15/minute")
async def start_pipeline_task(
    request: Request,
    body: PipelineTaskStartRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(require_internal_key),
):
    """
    Lance une tâche pipeline en arrière-plan. Suivi : **GET /api/pipeline/tasks/{task_id}**
    (polling client ~1 s).     Types : `collect`, `translate`, `refresh_clusters`, `full_pipeline`,
    `resume_pipeline`, et les étapes unitaires (`relevance_scoring`, `article_analysis`, …).
    Avec `chain_steps` : une chaîne ordonnée (tâche unique `pipeline_chain`).
    """
    edition_id_str = str(body.edition_id) if body.edition_id else None

    if body.chain_steps:
        steps = [s.value for s in body.chain_steps]
        if any(s in ("full_pipeline", "resume_pipeline") for s in steps) and await pipeline_is_busy_async():
            raise HTTPException(
                status_code=409,
                detail="Un pipeline complet est déjà en cours (planificateur ou autre session).",
            )
        task_id = await pipeline_task_store.create_task("pipeline_chain")
        background_tasks.add_task(
            execute_pipeline_chain_task,
            task_id,
            steps,
            body.translate_limit,
            edition_id_str,
            body.analysis_force,
        )
        return PipelineTaskStartResponse(task_id=task_id)

    if body.kind.value in ("full_pipeline", "resume_pipeline") and await pipeline_is_busy_async():
        raise HTTPException(
            status_code=409,
            detail="Un pipeline complet est déjà en cours (planificateur ou autre session).",
        )
    task_id = await pipeline_task_store.create_task(body.kind.value)
    background_tasks.add_task(
        execute_pipeline_task,
        task_id,
        body.kind.value,
        body.translate_limit,
        edition_id_str,
        body.analysis_force,
    )
    return PipelineTaskStartResponse(task_id=task_id)


@router.get("/pipeline/tasks/{task_id}")
async def get_pipeline_task(task_id: str):
    t = await pipeline_task_store.get_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tâche inconnue ou expirée")
    return t
