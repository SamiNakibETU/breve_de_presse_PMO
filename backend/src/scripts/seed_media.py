"""
Seed media_sources from MEDIA_REGISTRY.json (idempotent upsert).
Usage: python -m src.scripts.seed_media
"""

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_session_factory, init_db
from src.models.media_source import MediaSource

REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REGISTRY.json"


def _english_url(entry: dict) -> str | None:
    ev = entry.get("english_version")
    if isinstance(ev, dict):
        return ev.get("url")
    return None


async def seed() -> None:
    if not REGISTRY_PATH.exists():
        print(f"ERROR: {REGISTRY_PATH} not found")
        sys.exit(1)

    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    await init_db()
    factory = get_session_factory()

    async with factory() as db:
        count_new = 0
        count_updated = 0

        for m in data["media"]:
            result = await db.execute(
                select(MediaSource).where(MediaSource.id == m["id"])
            )
            existing = result.scalar_one_or_none()

            kwargs = dict(
                name=m["name"],
                country=m["country"],
                country_code=m["country_code"],
                tier=m["tier"],
                languages=m["languages"],
                editorial_line=m.get("editorial_line"),
                bias=m.get("bias"),
                content_types=m.get("content_types"),
                url=m["url"],
                rss_url=m.get("rss_url"),
                english_version_url=_english_url(m),
                collection_method=m.get("collection_method", "rss"),
                paywall=m.get("paywall", "free"),
                translation_quality=m.get("translation_quality_to_fr", "high"),
                editorial_notes=m.get("editorial_notes"),
            )

            if existing:
                for k, v in kwargs.items():
                    setattr(existing, k, v)
                count_updated += 1
            else:
                db.add(MediaSource(id=m["id"], **kwargs))
                count_new += 1

        await db.commit()

    total = len(data["media"])
    print(f"Seed complete: {count_new} new, {count_updated} updated ({total} total)")


if __name__ == "__main__":
    asyncio.run(seed())
