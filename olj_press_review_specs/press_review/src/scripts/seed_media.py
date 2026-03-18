"""
Seed media_sources table from MEDIA_REGISTRY.json.
Usage: python -m src.scripts.seed_media
"""

import json
import asyncio
import sys
from pathlib import Path

from src.models.database import MediaSource, get_session_factory, init_db


async def seed():
    """Insert all media sources from registry JSON."""
    # Find the registry file
    registry_path = Path(__file__).parent.parent.parent.parent / "MEDIA_REGISTRY.json"
    if not registry_path.exists():
        registry_path = Path("MEDIA_REGISTRY.json")
    if not registry_path.exists():
        print("ERROR: MEDIA_REGISTRY.json not found")
        sys.exit(1)

    with open(registry_path) as f:
        data = json.load(f)

    await init_db()
    sf = get_session_factory()

    async with sf() as db:
        count = 0
        for m in data["media"]:
            # Check if already exists
            from sqlalchemy import select
            existing = await db.execute(
                select(MediaSource).where(MediaSource.id == m["id"])
            )
            if existing.scalar_one_or_none():
                continue

            source = MediaSource(
                id=m["id"],
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
                english_version_url=m.get("english_version", {}).get("url") if isinstance(m.get("english_version"), dict) else None,
                collection_method=m.get("collection_method", "rss"),
                paywall=m.get("paywall", "free"),
                translation_quality=m.get("translation_quality_to_fr", "high"),
                editorial_notes=m.get("editorial_notes"),
            )
            db.add(source)
            count += 1

        await db.commit()
    print(f"Seeded {count} media sources ({len(data['media'])} total in registry)")


if __name__ == "__main__":
    asyncio.run(seed())
