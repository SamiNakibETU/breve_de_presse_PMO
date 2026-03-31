"""Import smoke : module partagé route + CLI (tests DB riches → Postgres)."""

from __future__ import annotations

import inspect

from src.services.media_sources_health_payload import build_media_sources_health_payload


def test_build_media_sources_health_payload_is_async() -> None:
    assert inspect.iscoroutinefunction(build_media_sources_health_payload)
