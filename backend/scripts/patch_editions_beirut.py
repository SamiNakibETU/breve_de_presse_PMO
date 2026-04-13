"""
Migration one-shot : recalcule window_start / window_end de toutes les éditions
en utilisant Asia/Beirut (UTC+3) au lieu de Europe/Paris (UTC+2).

Avant : fenêtres basées sur Paris   → décalage de +1h par rapport à Beyrouth.
Après : fenêtres basées sur Beyrouth → alignées avec le ressenti éditorial.

Changements par type :
  Édition normale (mar–dim)  : J-1 08h BEY → J 09h BEY  (avant : J-1 08h PAR → J 09h PAR)
  Édition lundi week-end     : ven 18h BEY → lun 09h BEY (avant : ven 18h PAR → lun 09h PAR)

Utilisation :
    python backend/scripts/patch_editions_beirut.py [--dry-run]
"""

import asyncio
import sys
import os
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

BEIRUT = ZoneInfo("Asia/Beirut")


def target_window(publish_date: date) -> tuple[datetime, datetime]:
    wd = publish_date.weekday()
    if wd == 0:
        friday = publish_date - timedelta(days=3)
        start = datetime.combine(friday, time(18, 0), tzinfo=BEIRUT).astimezone(timezone.utc)
        end = datetime.combine(publish_date, time(9, 0), tzinfo=BEIRUT).astimezone(timezone.utc)
    else:
        prev = publish_date - timedelta(days=1)
        start = datetime.combine(prev, time(8, 0), tzinfo=BEIRUT).astimezone(timezone.utc)
        end = datetime.combine(publish_date, time(9, 0), tzinfo=BEIRUT).astimezone(timezone.utc)
    return start, end


async def main(dry_run: bool = False) -> None:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from src.models.edition import Edition

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL non definie")
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(db_url, echo=False)
    updated = 0
    skipped = 0

    async with AsyncSession(engine) as db:
        rows = (await db.execute(select(Edition))).scalars().all()
        for ed in rows:
            if ed.publish_date is None:
                continue
            w0, w1 = target_window(ed.publish_date)
            stored_start = (
                ed.window_start.replace(tzinfo=timezone.utc)
                if ed.window_start.tzinfo is None
                else ed.window_start.astimezone(timezone.utc)
            )
            stored_end = (
                ed.window_end.replace(tzinfo=timezone.utc)
                if ed.window_end.tzinfo is None
                else ed.window_end.astimezone(timezone.utc)
            )
            if stored_start == w0 and stored_end == w1:
                skipped += 1
                continue
            print(
                f"  {ed.publish_date}  "
                f"{stored_start.isoformat()} → {stored_end.isoformat()}"
                f"  ====>  {w0.isoformat()} → {w1.isoformat()}"
            )
            if not dry_run:
                ed.window_start = w0
                ed.window_end = w1
            updated += 1
        if not dry_run:
            await db.commit()

    await engine.dispose()
    print(f"\n{'[DRY-RUN] ' if dry_run else ''}Updated: {updated}  |  Already correct: {skipped}")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    asyncio.run(main(dry_run=dry))
