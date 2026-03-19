from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

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
async def trigger_collect():
    try:
        stats = await run_collection()
        return {"status": "ok", "stats": stats}
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


@router.post("/translate")
async def trigger_translate(
    limit: int = Query(default=300, ge=1, le=1000),
):
    try:
        stats = await run_translation_pipeline(limit=limit)
        return {"status": "ok", "stats": stats}
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


@router.post("/pipeline")
async def trigger_pipeline():
    try:
        stats = await daily_pipeline()
        return {"status": "ok", "stats": stats}
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


@router.post("/pipeline/tasks", response_model=PipelineTaskStartResponse)
async def start_pipeline_task(
    body: PipelineTaskStartRequest,
    background_tasks: BackgroundTasks,
):
    """
    Lance une tâche pipeline en arrière-plan. Suivi : **GET /api/pipeline/tasks/{task_id}**
    (polling client ~1 s). Types : `collect`, `translate`, `refresh_clusters`, `full_pipeline`.
    """
    task_id = pipeline_task_store.create_task(body.kind.value)
    background_tasks.add_task(
        execute_pipeline_task,
        task_id,
        body.kind.value,
        body.translate_limit,
    )
    return PipelineTaskStartResponse(task_id=task_id)


@router.get("/pipeline/tasks/{task_id}")
async def get_pipeline_task(task_id: str):
    t = pipeline_task_store.get_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tâche inconnue ou expirée")
    return t
