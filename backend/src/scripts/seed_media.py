"""
Seed media_sources from MEDIA_REGISTRY.json (+ fusion MEDIA_REVUE_REGISTRY.json si présent).
Usage: python -m src.scripts.seed_media
"""

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select
from src.database import get_session_factory, init_db
from src.models.media_source import MediaSource

REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REGISTRY.json"
REVUE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REVUE_REGISTRY.json"


def _english_url(entry: dict) -> str | None:
    if entry.get("english_version_url"):
        return entry["english_version_url"]
    ev = entry.get("english_version")
    if isinstance(ev, dict):
        return ev.get("url")
    return None


def _load_merged_media() -> list[dict]:
    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    by_id: dict[str, dict] = {m["id"]: dict(m) for m in data["media"]}
    if REVUE_PATH.exists():
        rev = json.loads(REVUE_PATH.read_text(encoding="utf-8"))
        for m in rev.get("media", []):
            mid = m["id"]
            if mid in by_id:
                base = dict(by_id[mid])
                base.update(m)
                by_id[mid] = base
            else:
                by_id[mid] = dict(m)
    return list(by_id.values())


async def seed() -> None:
    if not REGISTRY_PATH.exists():
        print(f"ERROR: {REGISTRY_PATH} not found")
        sys.exit(1)

    media_list = _load_merged_media()
    await init_db()
    factory = get_session_factory()

    async with factory() as db:
        count_new = 0
        count_updated = 0

        for m in media_list:
            result = await db.execute(
                select(MediaSource).where(MediaSource.id == m["id"])
            )
            existing = result.scalar_one_or_none()

            hubs = m.get("opinion_hub_urls")
            opinion_json = json.dumps(hubs, ensure_ascii=False) if hubs else None

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
                rss_opinion_url=m.get("rss_opinion_url"),
                opinion_hub_urls_json=opinion_json,
                english_version_url=_english_url(m),
                collection_method=m.get("collection_method", "rss"),
                paywall=m.get("paywall", "free"),
                translation_quality=m.get("translation_quality_to_fr", "high"),
                editorial_notes=m.get("editorial_notes"),
                is_active=m.get("is_active", True),
            )

            if existing:
                for k, v in kwargs.items():
                    setattr(existing, k, v)
                count_updated += 1
            else:
                db.add(MediaSource(id=m["id"], **kwargs))
                count_new += 1

        await db.commit()

    revue_note = f" (+ revue {REVUE_PATH.name})" if REVUE_PATH.exists() else ""
    print(
        f"Seed complete: {count_new} new, {count_updated} updated "
        f"({len(media_list)} total){revue_note}",
    )


if __name__ == "__main__":
    asyncio.run(seed())
