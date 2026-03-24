"""Enregistrement asynchrone des requêtes HTTP (usage_events) pour le dashboard."""

from __future__ import annotations

import asyncio
import re
import time
from urllib.parse import parse_qs
from uuid import UUID

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from src.config import get_settings
from src.database import get_session_factory
from src.models.usage_event import UsageEvent

logger = structlog.get_logger(__name__)

_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

_SKIP_PATH_PREFIXES = (
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/favicon.ico",
)


def normalize_path_template(path: str) -> str:
    return _UUID_RE.sub("{id}", path)


def _parse_edition_from_path(path: str) -> tuple[UUID | None, UUID | None]:
    parts = [p for p in path.split("/") if p]
    edition_id: UUID | None = None
    edition_topic_id: UUID | None = None
    try:
        if len(parts) >= 3 and parts[0] == "api" and parts[1] == "editions":
            edition_id = UUID(parts[2])
        if "topics" in parts:
            i = parts.index("topics")
            if i + 1 < len(parts):
                edition_topic_id = UUID(parts[i + 1])
    except (ValueError, IndexError):
        pass
    return edition_id, edition_topic_id


def _parse_edition_from_query(query: str) -> UUID | None:
    if not query:
        return None
    try:
        qs = parse_qs(query)
    except Exception:
        return None
    for key in ("edition_id",):
        vals = qs.get(key)
        if not vals:
            continue
        try:
            return UUID(str(vals[0]).strip())
        except ValueError:
            return None
    return None


async def _persist_event(
    *,
    method: str,
    path: str,
    path_template: str,
    status_code: int,
    duration_ms: int,
    edition_id: UUID | None,
    edition_topic_id: UUID | None,
    editor_id: str | None,
) -> None:
    try:
        factory = get_session_factory()
        async with factory() as session:
            session.add(
                UsageEvent(
                    method=method[:8],
                    path=path[:512],
                    path_template=path_template[:512],
                    status_code=status_code,
                    duration_ms=duration_ms,
                    edition_id=edition_id,
                    edition_topic_id=edition_topic_id,
                    editor_id=(editor_id[:128] if editor_id else None),
                )
            )
            await session.commit()
    except Exception as exc:
        logger.warning(
            "usage_event.persist_failed",
            path=path[:120],
            error=str(exc)[:200],
        )


class UsageLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        settings = get_settings()
        if not getattr(settings, "usage_event_logging_enabled", True):
            return await call_next(request)

        raw_path = request.url.path or "/"
        method = (request.method or "GET").upper()
        if method == "OPTIONS":
            return await call_next(request)
        for prefix in _SKIP_PATH_PREFIXES:
            if raw_path == prefix or raw_path.startswith(prefix + "/"):
                return await call_next(request)
        if raw_path.startswith("/api/metrics"):
            return await call_next(request)

        t0 = time.perf_counter()
        response = await call_next(request)
        duration_ms = max(0, int((time.perf_counter() - t0) * 1000))
        path = raw_path[:512]
        path_template = normalize_path_template(path)[:512]
        ed_path, topic_path = _parse_edition_from_path(path)
        ed_query = _parse_edition_from_query(request.url.query or "")
        edition_id = ed_path or ed_query
        edition_topic_id = topic_path
        editor_id = request.headers.get("x-editor-id")

        asyncio.create_task(
            _persist_event(
                method=method,
                path=path,
                path_template=path_template,
                status_code=int(response.status_code),
                duration_ms=duration_ms,
                edition_id=edition_id,
                edition_topic_id=edition_topic_id,
                editor_id=editor_id,
            )
        )
        return response
