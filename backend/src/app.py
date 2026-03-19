"""
FastAPI application factory with lifespan, CORS, structured logging, and scheduler.
"""

import logging
import traceback
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import get_settings
from src.database import init_db
from src.routers import articles, clusters, health, pipeline, reviews
from src.services.scheduler import create_scheduler

settings = get_settings()


def _configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.log_level)
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

    scheduler = create_scheduler()
    scheduler.start()
    app.state.scheduler = scheduler
    log.info("app.scheduler_started")

    yield

    scheduler.shutdown(wait=False)
    log.info("app.shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="OLJ Press Review API",
        description="Automated regional press review for L'Orient-Le Jour",
        version="1.0.0",
        lifespan=lifespan,
    )

    origins = [
        "http://localhost:3000",
        "http://localhost:8080",
    ]
    if settings.frontend_url and settings.frontend_url not in origins:
        origins.append(settings.frontend_url)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if settings.environment != "development" else ["*"],
        allow_credentials=settings.environment != "development",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        structlog.get_logger().error(
            "unhandled_error",
            path=str(request.url),
            error=str(exc),
            traceback=traceback.format_exc(),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)},
        )

    app.include_router(health.router)
    app.include_router(articles.router)
    app.include_router(clusters.router)
    app.include_router(pipeline.router)
    app.include_router(reviews.router)

    return app


app = create_app()
