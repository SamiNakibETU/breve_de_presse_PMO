"""
Fenêtres de collecte par date de parution (Asia/Beirut, UTC+3).
- Édition du lundi (grosse édition) : vendredi 18:00 → lundi 09:00 (Beyrouth).
- Mardi–dimanche : J-1 08:00 → J 09:00 (Beyrouth).

Les éditions sont créées pour tous les jours (y compris week-end).
Le pipeline tourne chaque jour à 9h Paris (= 10h Beyrouth) ; une actualisation
à 18h Paris (= 19h Beyrouth / 16h UTC) couvre les articles publiés dans la journée.
Le toggle front filtre les articles arrivés après 13h UTC (seuil AGENTS.md).
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
PARIS = ZoneInfo("Europe/Paris")


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
    """Retourne (window_start, window_end) en UTC pour la date de parution cible.

    Fenêtres en heure de Beyrouth (Asia/Beirut, UTC+3) :
    - Lundi (grosse édition week-end) : vendredi 18:00 → lundi 09:00 Beyrouth.
    - Mardi–dimanche                  : J-1 08:00 → J 09:00 Beyrouth.
      (Samedi = ven 08h → sam 09h ; Dimanche = sam 08h → dim 09h)

    Pour le lundi « seul » (dim 09h → lun 09h), utiliser
    ``monday_single_day_window_utc`` ou créer une édition custom.
    """
    wd = publish_date.weekday()
    if wd == 0:  # lundi — grosse édition week-end (ven 18h → lun 9h Beyrouth)
        friday = publish_date - timedelta(days=3)
        start_local = datetime.combine(friday, time(18, 0), tzinfo=BEIRUT)
        end_local = datetime.combine(publish_date, time(9, 0), tzinfo=BEIRUT)
    else:  # mar–dim — édition normale J-1 08h → J 09h Beyrouth
        prev = publish_date - timedelta(days=1)
        start_local = datetime.combine(prev, time(8, 0), tzinfo=BEIRUT)
        end_local = datetime.combine(publish_date, time(9, 0), tzinfo=BEIRUT)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def monday_single_day_window_utc(publish_date: date) -> tuple[datetime, datetime]:
    """Fenêtre « lundi seul » : dimanche 09:00 → lundi 09:00 Beyrouth.

    Alternative à la grosse édition week-end pour les lundis où l'on veut
    uniquement les articles du dimanche. Utilisé via l'API /editions/custom
    ou directement dans les scripts de patch.
    """
    sunday = publish_date - timedelta(days=1)
    start_local = datetime.combine(sunday, time(9, 0), tzinfo=BEIRUT)
    end_local = datetime.combine(publish_date, time(9, 0), tzinfo=BEIRUT)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def next_publish_date(today: date) -> date:
    """Prochaine date de parution (tous les jours, y compris week-end)."""
    return today + timedelta(days=1)


def next_weekday_publish_date(today: date) -> date:
    """Alias conserve pour compatibilite -- redirige vers next_publish_date."""
    return next_publish_date(today)


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
    """Cree l'edition si absente, ou recalcule la fenetre si elle ne correspond plus.

    Idempotent sur publish_date. Si la fenetre stockee differe du calcul Beyrouth
    (apres migration Europe/Paris -> Asia/Beirut), elle est mise a jour.
    """
    existing = await db.execute(
        select(Edition).where(Edition.publish_date == publish_date)
    )
    row = existing.scalar_one_or_none()
    w0, w1 = default_window_utc(publish_date)
    if row:
        stored_start = (
            row.window_start.replace(tzinfo=timezone.utc)
            if row.window_start.tzinfo is None
            else row.window_start.astimezone(timezone.utc)
        )
        stored_end = (
            row.window_end.replace(tzinfo=timezone.utc)
            if row.window_end.tzinfo is None
            else row.window_end.astimezone(timezone.utc)
        )
        if stored_start != w0 or stored_end != w1:
            row.window_start = w0
            row.window_end = w1
            await db.flush()
            logger.info(
                "edition.window_recalculated",
                id=str(row.id),
                publish_date=str(publish_date),
                window_start=w0.isoformat(),
                window_end=w1.isoformat(),
            )
        return row
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
    """Crée les éditions des 7 derniers jours + 14 prochains jours si absentes.

    Couvre le passé récent (sam/dim manquants, jours fériés) et les 2 semaines
    à venir pour le rattachement préemptif des articles collectés en continu.
    """
    from src.database import get_session_factory

    today = datetime.now(BEIRUT).date()
    factory = get_session_factory()
    async with factory() as db:
        # 7 jours passés (sam/dim qui auraient pu être manqués)
        d = today - timedelta(days=7)
        while d <= today + timedelta(days=14):
            await ensure_edition_for_publish_date(db, d, status="COLLECTING")
            d += timedelta(days=1)
        await db.commit()
    logger.info(
        "edition.bootstrap_done",
        from_date=str(today - timedelta(days=7)),
        to_date=str(today + timedelta(days=14)),
    )


async def ensure_next_day_edition_job() -> None:
    """Cron 00:00 Paris : cree l'edition pour le lendemain (tous les jours)."""
    from src.database import get_session_factory

    today = datetime.now(PARIS).date()
    pub = next_publish_date(today)
    factory = get_session_factory()
    async with factory() as db:
        await ensure_edition_for_publish_date(db, pub, status="COLLECTING")
        await db.commit()
