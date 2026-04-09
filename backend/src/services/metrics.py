"""
Métriques : compteurs JSON (/api/metrics) + export Prometheus (SLO-friendly).

Les histogrammes / compteurs labellisés utilisent prometheus_client ; les clés historiques
`inc("foo.bar")` restent dans un dict pour compatibilité.
"""

from __future__ import annotations

import re
import threading
from collections import defaultdict

from prometheus_client import Counter, Histogram, generate_latest

_lock = threading.Lock()
_counts: dict[str, int] = defaultdict(int)

# --- Prometheus (SLO / alerting) ---
_PIPELINE_DURATION_BUCKETS = (
    0.1,
    0.5,
    1.0,
    2.0,
    5.0,
    15.0,
    30.0,
    60.0,
    120.0,
    300.0,
    900.0,
    3600.0,
)

pipeline_tasks_created_total = Counter(
    "olj_pipeline_tasks_created_total",
    "Tâches pipeline async créées",
    ["kind"],
)

pipeline_tasks_terminal_total = Counter(
    "olj_pipeline_tasks_terminal_total",
    "Tâches pipeline terminées (done ou error)",
    ["status", "kind"],
)

pipeline_task_duration_seconds = Histogram(
    "olj_pipeline_task_duration_seconds",
    "Durée création → fin (done/error) par type de tâche",
    ["kind"],
    buckets=_PIPELINE_DURATION_BUCKETS,
)

llm_requests_total = Counter(
    "olj_llm_requests_total",
    "Appels LLM terminés",
    ["provider", "outcome"],
)

llm_request_duration_seconds = Histogram(
    "olj_llm_request_duration_seconds",
    "Latence des appels LLM par fournisseur",
    ["provider"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 15.0, 30.0, 60.0, 120.0),
)

pipeline_step_duration_seconds = Histogram(
    "olj_pipeline_step_duration_seconds",
    "Durée de chaque étape du pipeline quotidien",
    ["step"],
    buckets=_PIPELINE_DURATION_BUCKETS,
)

pipeline_step_articles_total = Counter(
    "olj_pipeline_step_articles_total",
    "Articles traités par étape pipeline",
    ["step"],
)

pipeline_runs_total = Counter(
    "olj_pipeline_runs_total",
    "Lancements du pipeline complet",
    ["trigger", "outcome"],
)


def inc(key: str, delta: int = 1) -> None:
    if delta == 0:
        return
    with _lock:
        _counts[key] += delta


def snapshot() -> dict[str, int]:
    with _lock:
        return dict(_counts)


def record_pipeline_task_created(kind: str) -> None:
    pipeline_tasks_created_total.labels(kind=kind or "unknown").inc()
    inc("pipeline.tasks.created")


def record_pipeline_task_terminal(
    kind: str,
    *,
    status: str,
    duration_seconds: float | None,
) -> None:
    k = kind or "unknown"
    st = status if status in ("done", "error") else "error"
    pipeline_tasks_terminal_total.labels(status=st, kind=k).inc()
    if duration_seconds is not None and duration_seconds >= 0:
        pipeline_task_duration_seconds.labels(kind=k).observe(duration_seconds)
    if st == "done":
        inc("pipeline.tasks.done")
    else:
        inc("pipeline.tasks.error")


def record_llm_request(*, provider: str, outcome: str, duration_seconds: float) -> None:
    out = outcome if outcome in ("ok", "error", "rate_limited") else "error"
    llm_requests_total.labels(provider=provider, outcome=out).inc()
    if duration_seconds >= 0:
        llm_request_duration_seconds.labels(provider=provider).observe(duration_seconds)


def record_pipeline_step(
    step: str,
    *,
    duration_seconds: float,
    article_count: int = 0,
) -> None:
    """Enregistre la durée d'une étape pipeline et le nombre d'articles traités."""
    pipeline_step_duration_seconds.labels(step=step).observe(max(0.0, duration_seconds))
    if article_count > 0:
        pipeline_step_articles_total.labels(step=step).inc(article_count)


def record_pipeline_run(*, trigger: str, outcome: str) -> None:
    """Compteur global de lancement pipeline."""
    out = outcome if outcome in ("ok", "error") else "error"
    pipeline_runs_total.labels(trigger=trigger, outcome=out).inc()


def _prometheus_metric_name(key: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_:]", "_", key)
    if not s:
        return "app_unknown"
    if s[0].isdigit():
        s = "m_" + s
    return f"app_{s}"


def _legacy_prometheus_lines() -> str:
    lines: list[str] = []
    with _lock:
        for k, v in sorted(_counts.items()):
            name = _prometheus_metric_name(k)
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {v}")
    return "\n".join(lines)


def prometheus_text() -> str:
    """Format texte Prometheus : métriques labellisées + compteurs historiques."""
    modern = generate_latest().decode("utf-8")
    legacy = _legacy_prometheus_lines()
    parts = [p for p in (modern.strip(), legacy) if p]
    return "\n".join(parts) + "\n"
