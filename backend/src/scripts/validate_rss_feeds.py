"""
Valide les flux RSS / Atom renseignés sur `media_sources` (HTTP + feedparser).

Usage (depuis backend/, DATABASE_URL requis) :
  python -m src.scripts.validate_rss_feeds
  python -m src.scripts.validate_rss_feeds --output data/RSS_VALIDATION_REPORT.json
  python -m src.scripts.validate_rss_feeds --only-ids sa_okaz,jo_al_ghad
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiohttp
import feedparser
from sqlalchemy import select

from src.database import get_session_factory, init_db
from src.models.media_source import MediaSource

DEFAULT_OUT = Path(__file__).resolve().parent.parent.parent / "data" / "RSS_VALIDATION_REPORT.json"
USER_AGENT = (
    "Mozilla/5.0 (compatible; MEMW-RSS-Check/1.0; +https://orientlejour.com)"
)


async def _fetch_body(session: aiohttp.ClientSession, url: str) -> tuple[int, str, str | None]:
    try:
        async with session.get(
            url,
            timeout=aiohttp.ClientTimeout(total=25),
            headers={"User-Agent": USER_AGENT},
        ) as resp:
            text = await resp.text()
            return resp.status, text[:500_000], None
    except Exception as exc:
        return 0, "", str(exc)[:300]


def _parse_feed(body: str) -> dict[str, Any]:
    p = feedparser.parse(body)
    entries = getattr(p, "entries", []) or []
    bozo = getattr(p, "bozo", False)
    bozo_exc = getattr(p, "bozo_exception", None)
    return {
        "entry_count": len(entries),
        "bozo": bool(bozo),
        "bozo_message": str(bozo_exc)[:200] if bozo_exc else "",
        "feed_title": (getattr(p.feed, "title", "") or "")[:200],
        "last_entry_title": (entries[0].get("title", "") if entries else "")[:200],
        "last_entry_link": (entries[0].get("link", "") if entries else "")[:500],
    }


async def _run(
    *,
    only_ids: set[str] | None,
    out_path: Path,
) -> dict:
    await init_db()
    factory = get_session_factory()
    async with factory() as db:
        q = await db.execute(
            select(MediaSource).where(MediaSource.is_active.is_(True)).order_by(MediaSource.id)
        )
        sources = q.scalars().all()

    rows: list[dict[str, Any]] = []
    async with aiohttp.ClientSession() as session:
        for s in sources:
            if only_ids and s.id not in only_ids:
                continue
            feeds: list[tuple[str, str]] = []
            if (s.rss_url or "").strip():
                feeds.append(("rss_url", s.rss_url.strip()))
            if (s.rss_opinion_url or "").strip():
                feeds.append(("rss_opinion_url", s.rss_opinion_url.strip()))
            if not feeds:
                continue
            for field, url in feeds:
                status, body, err = await _fetch_body(session, url)
                parsed = _parse_feed(body) if body else {}
                overall_ok = status == 200 and int(parsed.get("entry_count") or 0) > 0
                rows.append(
                    {
                        "source_id": s.id,
                        "name": s.name,
                        "field": field,
                        "url": url[:500],
                        "http_status": status,
                        "fetch_error": err,
                        "parse_ok": bool(parsed.get("entry_count")),
                        "entry_count": parsed.get("entry_count", 0),
                        "bozo": parsed.get("bozo"),
                        "bozo_message": parsed.get("bozo_message"),
                        "feed_title": parsed.get("feed_title"),
                        "last_entry_title": parsed.get("last_entry_title"),
                        "last_entry_link": parsed.get("last_entry_link"),
                        "overall_ok": overall_ok,
                    }
                )
                await asyncio.sleep(0.15)

    summary = {
        "feeds_checked": len(rows),
        "feeds_ok": sum(1 for r in rows if r.get("overall_ok")),
        "feeds_fail": sum(1 for r in rows if not r.get("overall_ok")),
    }
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "rows": rows,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Valide les flux RSS des media_sources")
    ap.add_argument("--output", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--only-ids", type=str, default=None, help="IDs séparés par virgules")
    args = ap.parse_args()
    only = {x.strip() for x in args.only_ids.split(",") if x.strip()} if args.only_ids else None
    try:
        report = asyncio.run(_run(only_ids=only, out_path=args.output))
    except Exception as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)
    s = report["summary"]
    print(f"Flux testés: {s['feeds_checked']} — OK: {s['feeds_ok']} — KO: {s['feeds_fail']}")
    print(f"Rapport: {args.output}")
    if s["feeds_fail"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
