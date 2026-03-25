"""Reprise du pipeline quotidien à partir des étapes déjà journalisées (pipeline_debug_logs)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from uuid import UUID

import structlog
from sqlalchemy import select

from src.database import get_session_factory
from src.models.edition import PipelineDebugLog
from src.services.edition_schedule import BEIRUT

logger = structlog.get_logger(__name__)

_TRACKED = frozenset({"collect", "translate", "pipeline_summary"})


def beirut_calendar_date_utc_now() -> date:
    return datetime.now(BEIRUT).date()


def beirut_day_start_utc(d: date | None = None) -> datetime:
    """Minuit du jour calendaire Asia/Beirut, exprimé en UTC."""
    day = d if d is not None else beirut_calendar_date_utc_now()
    midnight_beirut = datetime.combine(day, time.min, tzinfo=BEIRUT)
    return midnight_beirut.astimezone(timezone.utc)


@dataclass(frozen=True)
class PipelineResumeSnapshot:
    edition_id: UUID | None
    has_collect: bool
    has_translate: bool
    has_pipeline_summary: bool
    skip_collect: bool
    skip_translate: bool
    beirut_day: date


async def load_resume_snapshot_for_edition(
    edition_id: UUID | None,
    *,
    day: date | None = None,
) -> PipelineResumeSnapshot:
    """
    Étapes enregistrées ce jour-là (minuit→minuit Beyrouth) pour cette édition.
    Reprise : sauter collecte / traduction si une ligne `collect` / `translate` existe déjà.
    """
    d = day if day is not None else beirut_calendar_date_utc_now()
    since = beirut_day_start_utc(d)
    if edition_id is None:
        return PipelineResumeSnapshot(
            edition_id=None,
            has_collect=False,
            has_translate=False,
            has_pipeline_summary=False,
            skip_collect=False,
            skip_translate=False,
            beirut_day=d,
        )

    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(PipelineDebugLog.step)
            .where(
                PipelineDebugLog.edition_id == edition_id,
                PipelineDebugLog.created_at >= since,
                PipelineDebugLog.step.in_(tuple(_TRACKED)),
            )
            .distinct(),
        )
        steps = {row[0] for row in result.all()}

    has_collect = "collect" in steps
    has_translate = "translate" in steps
    has_summary = "pipeline_summary" in steps
    return PipelineResumeSnapshot(
        edition_id=edition_id,
        has_collect=has_collect,
        has_translate=has_translate,
        has_pipeline_summary=has_summary,
        skip_collect=has_collect,
        skip_translate=has_translate,
        beirut_day=d,
    )


async def should_auto_retry_completion(
    *,
    paris_hour: int,
    paris_start_hour: int,
    paris_end_hour: int,
) -> bool:
    """
    True si un run automatique « complétion » a un sens : collecte déjà loguée aujourd’hui
    mais pas de `pipeline_summary` (ex. timeout au milieu du pipeline).
    """
    from src.services.pipeline_debug_log import resolve_current_edition_id

    if paris_start_hour > paris_end_hour:
        return False
    if not (paris_start_hour <= paris_hour < paris_end_hour):
        return False

    eid = await resolve_current_edition_id()
    snap = await load_resume_snapshot_for_edition(eid)
    if snap.has_pipeline_summary:
        return False
    if not snap.has_collect:
        return False
    return True
