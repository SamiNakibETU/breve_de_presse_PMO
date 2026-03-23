from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import text

from src.config import get_settings
from src.database import get_session_factory
from src.schemas.pipeline import SchedulerJobResponse, StatusResponse
from src.services.metrics import prometheus_text, snapshot as metrics_snapshot

router = APIRouter()
settings = get_settings()
_log = structlog.get_logger(__name__)


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
    runs_raw = getattr(request.app.state, "scheduler_job_runs", None)
    runs: dict[str, Any] = runs_raw if isinstance(runs_raw, dict) else {}
    jobs: list[SchedulerJobResponse] = []

    if scheduler:
        try:
            for j in scheduler.get_jobs():
                jid = getattr(j, "id", None) or ""
                jname = getattr(j, "name", None) or ""
                meta = runs.get(jid) if jid else None
                last_at = None
                last_ok = None
                if isinstance(meta, dict):
                    raw_at = meta.get("at")
                    if isinstance(raw_at, str):
                        last_at = raw_at
                    if "ok" in meta and isinstance(meta.get("ok"), bool):
                        last_ok = meta["ok"]
                nrt = getattr(j, "next_run_time", None)
                jobs.append(
                    SchedulerJobResponse(
                        id=jid or "unknown",
                        name=jname or "job",
                        next_run=str(nrt) if nrt else None,
                        last_run_at=last_at,
                        last_run_ok=last_ok,
                    )
                )
        except Exception as exc:
            _log.warning(
                "api.status.scheduler_jobs_failed",
                error=str(exc)[:300],
            )

    return StatusResponse(
        status="running",
        environment=settings.environment,
        jobs=jobs,
    )
