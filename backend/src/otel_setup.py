"""
OpenTelemetry (optionnel) : traces HTTP FastAPI + client httpx si OTEL_EXPORTER_OTLP_ENDPOINT est défini.
"""

from __future__ import annotations

import os

import structlog

logger = structlog.get_logger(__name__)


def instrument_fastapi_app(app) -> None:
    """Active l’export OTLP HTTP vers OTEL_EXPORTER_OTLP_ENDPOINT (ou TRACES)."""
    endpoint = (
        os.environ.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "").strip()
        or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    )
    if not endpoint:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError as exc:
        logger.warning("otel.import_failed", error=str(exc))
        return

    service_name = os.environ.get("OTEL_SERVICE_NAME", "olj-press-review-api")
    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=endpoint)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)

    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
    except Exception as exc:
        logger.warning("otel.httpx_instrument_failed", error=str(exc)[:200])

    logger.info("otel.enabled", endpoint=endpoint[:80], service=service_name)
