from fastapi import APIRouter, HTTPException, Query

from src.services.collector import run_collection
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
