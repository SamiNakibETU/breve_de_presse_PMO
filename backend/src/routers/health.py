from fastapi import APIRouter, Request

from src.config import get_settings
from src.schemas.pipeline import SchedulerJobResponse, StatusResponse

router = APIRouter()
settings = get_settings()


@router.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}


@router.get("/api/status", response_model=StatusResponse)
async def status(request: Request):
    scheduler = getattr(request.app.state, "scheduler", None)
    jobs: list[SchedulerJobResponse] = []

    if scheduler:
        for j in scheduler.get_jobs():
            jobs.append(
                SchedulerJobResponse(
                    id=j.id,
                    name=j.name,
                    next_run=str(j.next_run_time) if j.next_run_time else None,
                )
            )

    return StatusResponse(
        status="running",
        environment=settings.environment,
        jobs=jobs,
    )
