"""
Tâches pipeline longues : état en mémoire pour suivi + polling HTTP.

Limite : un seul processus worker (mémoire locale). Plusieurs instances Railway
ou plusieurs workers → utiliser Redis ou une table SQL « job ».
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any

MAX_TASKS = 80

_lock = threading.Lock()
_tasks: dict[str, dict[str, Any]] = {}


def _prune_if_needed() -> None:
    if len(_tasks) <= MAX_TASKS:
        return
    sorted_ids = sorted(
        _tasks.keys(),
        key=lambda tid: str(_tasks[tid].get("created_at") or ""),
    )
    overflow = len(_tasks) - MAX_TASKS + 1
    for tid in sorted_ids[:overflow]:
        _tasks.pop(tid, None)


def create_task(kind: str) -> str:
    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        _prune_if_needed()
        _tasks[tid] = {
            "task_id": tid,
            "kind": kind,
            "status": "pending",
            "step_key": "queued",
            "step_label": "En file…",
            "result": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
    return tid


def update_step(task_id: str, step_key: str, step_label: str) -> None:
    with _lock:
        t = _tasks.get(task_id)
        if not t:
            return
        t["status"] = "running"
        t["step_key"] = step_key
        t["step_label"] = step_label
        t["updated_at"] = datetime.now(timezone.utc).isoformat()


def finish_ok(task_id: str, result: dict) -> None:
    with _lock:
        t = _tasks.get(task_id)
        if not t:
            return
        t["status"] = "done"
        t["step_key"] = "done"
        t["step_label"] = "Terminé"
        t["result"] = result
        t["updated_at"] = datetime.now(timezone.utc).isoformat()


def finish_error(task_id: str, message: str) -> None:
    with _lock:
        t = _tasks.get(task_id)
        if not t:
            return
        t["status"] = "error"
        t["step_key"] = "error"
        t["step_label"] = "Erreur"
        t["error"] = message
        t["updated_at"] = datetime.now(timezone.utc).isoformat()


def get_task(task_id: str) -> dict[str, Any] | None:
    with _lock:
        t = _tasks.get(task_id)
        return dict(t) if t else None
