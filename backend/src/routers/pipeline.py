from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request

from typing import Optional

from src.config import get_settings
from src.deps.auth import require_internal_key
from src.limiter import limiter
from src.schemas.pipeline import (
    PipelineTaskStartRequest,
    PipelineTaskStartResponse,
)
from src.services import pipeline_task_store
from src.services.collector import run_collection
from src.services.pipeline_async_jobs import execute_pipeline_task
from src.services.scheduler import daily_pipeline
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
        stats = await daily_pipeline()
        return {"status": "ok", "stats": stats}
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


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
    (polling client ~1 s). Types : `collect`, `translate`, `refresh_clusters`, `full_pipeline`.
    """
    task_id = await pipeline_task_store.create_task(body.kind.value)
    background_tasks.add_task(
        execute_pipeline_task,
        task_id,
        body.kind.value,
        body.translate_limit,
    )
    return PipelineTaskStartResponse(task_id=task_id)


@router.get("/pipeline/tasks/{task_id}")
async def get_pipeline_task(task_id: str):
    t = await pipeline_task_store.get_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tâche inconnue ou expirée")
    return t
