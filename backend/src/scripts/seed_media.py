"""
Seed media_sources from MEDIA_REGISTRY.json (+ fusion MEDIA_REVUE_REGISTRY.json si présent).
Usage:
  python -m src.scripts.seed_media
  python -m src.scripts.seed_media --revue-only   # uniquement MEDIA_REVUE_REGISTRY.json
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select
from src.database import get_session_factory, init_db
from src.models.media_source import MediaSource

REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REGISTRY.json"
REVUE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REVUE_REGISTRY.json"
RSS_SUPPLEMENT_PATH = (
    Path(__file__).resolve().parent.parent.parent / "data" / "RSS_OPINION_SUPPLEMENT.json"
)


def _apply_rss_supplement(media_list: list[dict]) -> None:
    if not RSS_SUPPLEMENT_PATH.exists():
        return
    raw = json.loads(RSS_SUPPLEMENT_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        return
    by_id = {m["id"]: m for m in media_list}
    for mid, url in raw.items():
        if not isinstance(url, str) or not url.strip():
            continue
        if mid not in by_id:
            continue
        cur = (by_id[mid].get("rss_opinion_url") or "").strip()
        if not cur:
            by_id[mid]["rss_opinion_url"] = url.strip()


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


def _load_revue_only() -> list[dict]:
    if not REVUE_PATH.exists():
        print(f"ERROR: {REVUE_PATH} not found (run import_media_revue_csv first)")
        sys.exit(1)
    rev = json.loads(REVUE_PATH.read_text(encoding="utf-8"))
    return [dict(m) for m in rev.get("media", [])]


async def seed(*, revue_only: bool = False) -> None:
    if revue_only:
        media_list = _load_revue_only()
    else:
        if not REGISTRY_PATH.exists():
            print(f"ERROR: {REGISTRY_PATH} not found")
            sys.exit(1)
        media_list = _load_merged_media()
    _apply_rss_supplement(media_list)
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
    parser = argparse.ArgumentParser(description="Seed media_sources from JSON registries.")
    parser.add_argument(
        "--revue-only",
        action="store_true",
        help="Load only MEDIA_REVUE_REGISTRY.json (CSV OLJ), no fusion with MEDIA_REGISTRY.json",
    )
    args = parser.parse_args()
    asyncio.run(seed(revue_only=args.revue_only))
