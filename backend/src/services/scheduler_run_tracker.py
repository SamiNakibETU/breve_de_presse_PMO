"""
Enregistre le dernier résultat d’exécution des jobs APScheduler (processus courant).

Utilisé par GET /api/status pour exposer last_run_at / last_run_ok.
Les valeurs sont perdues au redémarrage du serveur — comportement voulu (léger, sans migration).
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED, JobExecutionEvent
from apscheduler.schedulers.base import BaseScheduler


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def attach_scheduler_run_tracker(scheduler: BaseScheduler, app: Any) -> None:
    """Initialise app.state.scheduler_job_runs et branche les listeners APScheduler."""

    runs: dict[str, dict[str, Any]] = {}
    lock = threading.Lock()
    app.state.scheduler_job_runs = runs

    def on_job_execution(event: JobExecutionEvent) -> None:
        if not event.job_id:
            return
        now = _utc_now_iso()
        with lock:
            if event.code == EVENT_JOB_EXECUTED:
                runs[event.job_id] = {"at": now, "ok": True}
            elif event.code == EVENT_JOB_ERROR:
                runs[event.job_id] = {"at": now, "ok": False}

    scheduler.add_listener(on_job_execution, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)
