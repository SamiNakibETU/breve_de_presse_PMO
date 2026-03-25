"""Lease Postgres pour exclusivité du pipeline quotidien (multi-réplicas)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from sqlalchemy import text

from src.database import get_session_factory

logger = structlog.get_logger(__name__)

DAILY_PIPELINE_LEASE_KEY = "daily_pipeline"


@dataclass(frozen=True)
class PipelineLeaseSnapshot:
    lease_key: str
    holder_id: str | None
    trigger_label: str | None
    heartbeat_at: datetime | None
    expires_at: datetime | None
    updated_at: datetime | None


def _row_to_snapshot(row: Any) -> PipelineLeaseSnapshot | None:
    if row is None:
        return None
    return PipelineLeaseSnapshot(
        lease_key=str(row[0]),
        holder_id=str(row[1]) if row[1] is not None else None,
        trigger_label=str(row[2]) if row[2] is not None else None,
        heartbeat_at=row[3],
        expires_at=row[4],
        updated_at=row[5],
    )


async def try_acquire_daily_pipeline_lease(
    *,
    holder_id: str,
    trigger: str,
    ttl_seconds: int,
) -> bool:
    """True si ce processus détient désormais le lease (UPDATE atomique)."""
    if ttl_seconds < 60:
        ttl_seconds = 60
    exp = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    factory = get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE pipeline_execution_lease
                SET holder_id = :hid,
                    trigger_label = :trig,
                    acquired_at = NOW(),
                    heartbeat_at = NOW(),
                    expires_at = :exp,
                    updated_at = NOW()
                WHERE lease_key = :lk
                  AND (holder_id IS NULL OR expires_at < NOW())
                RETURNING lease_key
                """
            ),
            {
                "hid": holder_id,
                "trig": trigger[:2000] if trigger else None,
                "exp": exp,
                "lk": DAILY_PIPELINE_LEASE_KEY,
            },
        )
        row = res.first()
        await db.commit()
        ok = row is not None
        if ok:
            logger.info(
                "pipeline_lease.acquired",
                holder_id=holder_id[:16],
                trigger=trigger[:80] if trigger else None,
                ttl_s=ttl_seconds,
            )
        return ok


async def renew_daily_pipeline_lease(*, holder_id: str, ttl_seconds: int) -> bool:
    """Prolonge le lease ; True si encore détenteur."""
    if ttl_seconds < 60:
        ttl_seconds = 60
    factory = get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                UPDATE pipeline_execution_lease
                SET heartbeat_at = NOW(),
                    expires_at = NOW() + CAST(:ttl AS INTERVAL),
                    updated_at = NOW()
                WHERE lease_key = :lk AND holder_id = :hid
                RETURNING lease_key
                """
            ),
            {
                "hid": holder_id,
                "ttl": f"{int(ttl_seconds)} seconds",
                "lk": DAILY_PIPELINE_LEASE_KEY,
            },
        )
        row = res.first()
        await db.commit()
        return row is not None


async def release_daily_pipeline_lease(*, holder_id: str) -> None:
    factory = get_session_factory()
    async with factory() as db:
        await db.execute(
            text(
                """
                UPDATE pipeline_execution_lease
                SET holder_id = NULL,
                    trigger_label = NULL,
                    acquired_at = NULL,
                    heartbeat_at = NULL,
                    expires_at = NOW(),
                    updated_at = NOW()
                WHERE lease_key = :lk AND holder_id = :hid
                """
            ),
            {"hid": holder_id, "lk": DAILY_PIPELINE_LEASE_KEY},
        )
        await db.commit()
    logger.info("pipeline_lease.released", holder_id=holder_id[:16])


async def fetch_daily_pipeline_lease() -> PipelineLeaseSnapshot | None:
    factory = get_session_factory()
    async with factory() as db:
        res = await db.execute(
            text(
                """
                SELECT lease_key, holder_id, trigger_label, heartbeat_at, expires_at, updated_at
                FROM pipeline_execution_lease
                WHERE lease_key = :lk
                """
            ),
            {"lk": DAILY_PIPELINE_LEASE_KEY},
        )
        row = res.first()
    return _row_to_snapshot(row)


async def is_daily_pipeline_lease_held_alive() -> bool:
    """Un autre processus (ou nous) détient un lease non expiré."""
    snap = await fetch_daily_pipeline_lease()
    if snap is None or snap.holder_id is None or snap.expires_at is None:
        return False
    now = datetime.now(timezone.utc)
    return snap.expires_at > now


async def seconds_since_heartbeat() -> float | None:
    """Âge en secondes du dernier heartbeat (UTC) ; None si pas de lease actif."""
    snap = await fetch_daily_pipeline_lease()
    if snap is None or snap.holder_id is None or snap.heartbeat_at is None:
        return None
    now = datetime.now(timezone.utc)
    if snap.expires_at is not None and snap.expires_at <= now:
        return None
    hb = snap.heartbeat_at
    if hb.tzinfo is None:
        hb = hb.replace(tzinfo=timezone.utc)
    return max(0.0, (now - hb).total_seconds())


async def ensure_lease_table_row() -> None:
    """Idempotent : garantit la ligne `daily_pipeline` (init sans Alembic)."""
    factory = get_session_factory()
    async with factory() as db:
        await db.execute(
            text(
                """
                INSERT INTO pipeline_execution_lease (
                    lease_key, holder_id, trigger_label,
                    acquired_at, heartbeat_at, expires_at, updated_at
                )
                VALUES (
                    :lk, NULL, NULL, NULL, NULL, NOW(), NOW()
                )
                ON CONFLICT (lease_key) DO NOTHING
                """
            ),
            {"lk": DAILY_PIPELINE_LEASE_KEY},
        )
        await db.commit()
