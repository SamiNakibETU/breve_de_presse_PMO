from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import text

from src.config import get_settings
from src.database import get_session_factory
from src.schemas.pipeline import SchedulerJobResponse, StatusResponse
from src.services.metrics import prometheus_text, snapshot as metrics_snapshot

router = APIRouter()
settings = get_settings()


@router.get("/")
async def root():
    return {
        "app": "OLJ Press Review API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "health_ready": "/health/ready",
        "metrics": "/api/metrics",
        "metrics_prometheus": "/api/metrics/prometheus",
        "status": "/api/status",
    }


@router.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}


@router.get("/api/metrics")
async def api_metrics():
    """Compteurs depuis le boot du process (voir docs/DEPLOY.md)."""
    if not settings.expose_metrics:
        raise HTTPException(status_code=404, detail="Metrics disabled")
    return metrics_snapshot()


@router.get(
    "/api/metrics/prometheus",
    response_class=PlainTextResponse,
    responses={200: {"content": {"text/plain": {}}}},
)
async def api_metrics_prometheus():
    """Export Prometheus (texte) à partir des mêmes compteurs."""
    if not settings.expose_metrics:
        raise HTTPException(status_code=404, detail="Metrics disabled")
    return prometheus_text()


@router.get("/health/ready")
async def health_ready():
    """Pour orchestrateurs : échoue si la base n’est pas joignable."""
    try:
        factory = get_session_factory()
        async with factory() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ready", "database": "ok"}
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "database": str(exc)[:200]},
        ) from exc


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
