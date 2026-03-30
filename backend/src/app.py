"""
FastAPI application factory with lifespan, CORS, structured logging, and scheduler.
"""

import asyncio
import logging
import traceback
from contextlib import asynccontextmanager, suppress

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog.contextvars
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from src.config import get_settings
from src.limiter import limiter
from src.middleware.correlation import CorrelationIdMiddleware
from src.middleware.usage_logging import UsageLoggingMiddleware
from src.database import init_db
from src.routers import articles, clusters, config, editions, health, olj_watch, pipeline, regie, reviews
from src.services.scheduler import create_scheduler
from src.services.scheduler_run_tracker import attach_scheduler_run_tracker
from src.otel_setup import instrument_fastapi_app

settings = get_settings()


def _log_level_int(name: str) -> int:
    lvl = getattr(logging, name.upper(), None)
    return lvl if isinstance(lvl, int) else logging.INFO


def _configure_logging() -> None:
    if settings.log_json:
        processors: list = [
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    else:
        processors = [
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            _log_level_int(settings.log_level),
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _configure_logging()
    log = structlog.get_logger()

    log.info("app.startup", environment=settings.environment)
    await init_db()
    log.info("app.db_ready")

    # Ne pas bloquer le yield : seed + bootstrap + scheduler peuvent prendre >30 s
    # (centaines de SELECT media_sources). Sans tâche de fond, Uvicorn n’écoute pas
    # et le proxy Next / Railway renvoie 502 « Application failed to respond ».
    app.state.scheduler = None

    async def _heavy_startup() -> None:
        try:
            from src.scripts.seed_media import seed

            await seed()
            log.info("app.media_sources_seeded")
        except Exception as exc:
            log.warning("app.seed_failed", error=str(exc)[:200])

        try:
            from src.services.edition_schedule import bootstrap_editions_for_two_weeks

            await bootstrap_editions_for_two_weeks()
            log.info("app.editions_bootstrapped")
        except Exception as exc:
            log.warning("app.editions_bootstrap_failed", error=str(exc)[:200])

        if settings.scheduler_enabled:
            scheduler = create_scheduler()
            attach_scheduler_run_tracker(scheduler, app)
            scheduler.start()
            app.state.scheduler = scheduler
            log.info("app.scheduler_started")
        else:
            log.info("app.scheduler_disabled")

    startup_bg = asyncio.create_task(_heavy_startup())
    app.state.startup_background_task = startup_bg
    log.info("app.listening", note="seed/bootstrap/scheduler en arrière-plan")

    yield

    startup_bg.cancel()
    with suppress(asyncio.CancelledError):
        await startup_bg

    sched = getattr(app.state, "scheduler", None)
    if sched is not None:
        sched.shutdown(wait=False)
    log.info("app.shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="OLJ Press Review API",
        description="Automated regional press review for L'Orient-Le Jour",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    origins = [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8080",
    ]
    for raw in (
        settings.frontend_url,
        *(
            o.strip()
            for o in settings.cors_origins.split(",")
            if o.strip()
        ),
    ):
        url = (raw or "").strip().rstrip("/")
        if url and url not in origins:
            origins.append(url)

    app.add_middleware(CorrelationIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if settings.environment != "development" else ["*"],
        allow_credentials=settings.environment != "development",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        ctx = structlog.contextvars.get_contextvars()
        structlog.get_logger().error(
            "unhandled_error",
            path=str(request.url),
            error=str(exc),
            traceback=traceback.format_exc(),
            **ctx,
        )
        if settings.environment == "production":
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
            )
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)},
        )

    app.include_router(health.router)
    app.include_router(config.router)
    app.include_router(editions.router)
    app.include_router(articles.router)
    app.include_router(clusters.router)
    app.include_router(pipeline.router)
    app.include_router(reviews.router)
    app.include_router(olj_watch.router)
    app.include_router(regie.router)

    instrument_fastapi_app(app)

    app.add_middleware(UsageLoggingMiddleware)

    return app


app = create_app()
