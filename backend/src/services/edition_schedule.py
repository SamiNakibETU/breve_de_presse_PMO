"""
Fenêtres de collecte par date de parution (Asia/Beirut).
- Édition du lundi : vendredi 18:00 → lundi 06:00 (Beyrouth).
- Mardi–vendredi : J-1 18:00 → J 06:00 (Beyrouth).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import structlog
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from src.models.article import Article
from src.models.edition import Edition

logger = structlog.get_logger(__name__)
BEIRUT = ZoneInfo("Asia/Beirut")


def sql_article_belongs_to_edition_corpus(edition: Edition) -> ColumnElement[bool]:
    """Article rattaché au corpus d’une édition (liste / compteurs / détection sujets).

    À l’ingestion, ``edition_id`` est défini depuis ``published_at`` (collecteur). En revanche
    ``collected_at`` est l’heure d’enregistrement : avec un cron après ``window_end`` Beyrouth,
    un filtre *uniquement* sur ``collected_at`` exclut tous les articles. On suit donc
    ``edition_id``, avec repli temporel pour les lignes legacy sans ``edition_id``.
    """
    ts = func.coalesce(Article.published_at, Article.collected_at)
    legacy_in_window = and_(
        Article.edition_id.is_(None),
        ts >= edition.window_start,
        ts < edition.window_end,
    )
    return or_(Article.edition_id == edition.id, legacy_in_window)


def default_window_utc(publish_date: date) -> tuple[datetime, datetime]:
    """Retourne (window_start, window_end) en UTC pour la date de parution cible."""
    wd = publish_date.weekday()
    if wd == 0:  # lundi
        friday = publish_date - timedelta(days=3)
        start_local = datetime.combine(friday, time(18, 0), tzinfo=BEIRUT)
        end_local = datetime.combine(publish_date, time(6, 0), tzinfo=BEIRUT)
    elif wd in (1, 2, 3, 4):  # mar–ven
        prev = publish_date - timedelta(days=1)
        start_local = datetime.combine(prev, time(18, 0), tzinfo=BEIRUT)
        end_local = datetime.combine(publish_date, time(6, 0), tzinfo=BEIRUT)
    else:
        # week-end : même logique que lundi (fenêtre se termine lundi 6h)
        if wd == 5:  # samedi
            monday = publish_date + timedelta(days=2)
        else:
            monday = publish_date + timedelta(days=1)
        friday = monday - timedelta(days=3)
        start_local = datetime.combine(friday, time(18, 0), tzinfo=BEIRUT)
        end_local = datetime.combine(monday, time(6, 0), tzinfo=BEIRUT)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def next_weekday_publish_date(today: date) -> date:
    """Prochaine date de parution éditoriale (lun–ven), à partir d’« aujourd’hui » Beyrouth."""
    d = today + timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


async def resolve_edition_id_for_timestamp(
    db: AsyncSession,
    published_at: Optional[datetime],
) -> Optional[uuid.UUID]:
    """Rattache un article à l’édition dont la fenêtre contient `published_at` (UTC)."""
    if published_at is None:
        return None
    ts = published_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    else:
        ts = ts.astimezone(timezone.utc)
    stmt = (
        select(Edition.id)
        .where(Edition.window_start <= ts, ts < Edition.window_end)
        .limit(1)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def ensure_edition_for_publish_date(
    db: AsyncSession,
    publish_date: date,
    *,
    status: str = "COLLECTING",
) -> Edition:
    """Crée l’édition si absente (idempotent sur publish_date)."""
    existing = await db.execute(
        select(Edition).where(Edition.publish_date == publish_date)
    )
    row = existing.scalar_one_or_none()
    if row:
        return row
    w0, w1 = default_window_utc(publish_date)
    ed = Edition(
        publish_date=publish_date,
        window_start=w0,
        window_end=w1,
        timezone="Asia/Beirut",
        status=status,
    )
    db.add(ed)
    await db.flush()
    logger.info(
        "edition.created",
        id=str(ed.id),
        publish_date=str(publish_date),
        window_start=w0.isoformat(),
        window_end=w1.isoformat(),
    )
    return ed


async def find_edition_for_calendar_date(
    db: AsyncSession,
    calendar_date: date,
) -> Optional[Edition]:
    """Résout une édition pour une date calendaire (ex. URL ``/by-date/YYYY-MM-DD``).

    1) Ligne avec ``publish_date`` égal au jour demandé (jours ouvrés de parution).
    2) Sinon, édition dont la fenêtre contient le **midi** (Asia/Beirut) de ce jour
    (week-ends et cas sans ligne ``publish_date`` dédiée).
    """
    res = await db.execute(
        select(Edition).where(Edition.publish_date == calendar_date).limit(1)
    )
    row = res.scalar_one_or_none()
    if row:
        return row
    noon_local = datetime.combine(calendar_date, time(12, 0), tzinfo=BEIRUT)
    ts_utc = noon_local.astimezone(timezone.utc)
    res2 = await db.execute(
        select(Edition)
        .where(Edition.window_start <= ts_utc, ts_utc < Edition.window_end)
        .limit(1)
    )
    return res2.scalar_one_or_none()


async def bootstrap_editions_for_two_weeks() -> None:
    """Crée les éditions des ~2 prochaines semaines (jours ouvrés) si absentes — pour rattachement collecte."""
    from datetime import timedelta

    from src.database import get_session_factory

    today = datetime.now(BEIRUT).date()
    factory = get_session_factory()
    async with factory() as db:
        d = today
        for _ in range(14):
            if d.weekday() < 5:
                await ensure_edition_for_publish_date(db, d, status="COLLECTING")
            d += timedelta(days=1)
        await db.commit()


async def ensure_next_day_edition_job() -> None:
    """Cron 00:00 Beyrouth : crée l’édition pour la prochaine date de parution (lun–ven)."""
    from src.database import get_session_factory

    today = datetime.now(BEIRUT).date()
    pub = next_weekday_publish_date(today)
    factory = get_session_factory()
    async with factory() as db:
        await ensure_edition_for_publish_date(db, pub, status="COLLECTING")
        await db.commit()
