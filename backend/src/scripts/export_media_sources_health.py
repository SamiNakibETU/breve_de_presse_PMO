"""
Exporte la santé des sources (équivalent GET /api/media-sources/health) + classification diagnostic.

Usage (depuis backend/, DATABASE_URL requis) :
  python -m src.scripts.export_media_sources_health
  python -m src.scripts.export_media_sources_health --output data/MEDIA_HEALTH_EXPORT.json
  python -m src.scripts.export_media_sources_health --csv data/MEDIA_HEALTH_EXPORT.csv
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from src.database import get_session_factory, init_db
from src.services.media_sources_health_payload import build_media_sources_health_payload


def _classify_diagnostic(row: dict) -> str:
    """Heuristique légère (pas de vérité terrain réseau)."""
    health = row.get("health_status") or ""
    a72 = int(row.get("articles_72h") or 0)
    lc = row.get("last_collection") or {}
    found = lc.get("articles_found")
    filt = lc.get("articles_filtered")
    new = lc.get("articles_new")
    empty_runs = int(row.get("consecutive_empty_collection_runs") or 0)

    if health == "ok" and a72 > 0:
        return "collecte_active"
    if health == "ok" and a72 == 0:
        return "ok_mais_zero_72h_peu_publication_ou_filtre"
    if lc and found == 0:
        return "run_recent_mais_zero_article_trouve_flux_ou_hub_vide"
    if lc and isinstance(found, int) and found > 0 and (new == 0 or new is None):
        return "articles_trouves_tous_filtres_ou_dedup"
    if empty_runs >= 3 and a72 == 0:
        return "runs_vides_repetes"
    if health == "dead":
        return "aucun_article_72h_et_collecte_stale_ou_jamais"
    if health == "degraded":
        return "degraded_faible_volume_ou_recent_sans_volume"
    return "autre"


async def _run() -> dict:
    await init_db()
    factory = get_session_factory()
    async with factory() as db:
        payload = await build_media_sources_health_payload(db)

    classified: list[dict] = []
    for s in payload["sources"]:
        row = dict(s)
        row["diagnostic_bucket"] = _classify_diagnostic(s)
        classified.append(row)

    out = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "window_hours": payload.get("window_hours"),
        "critical_p0_sources_down": payload.get("critical_p0_sources_down"),
        "sources": classified,
    }
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Export santé media_sources (72 h).")
    ap.add_argument(
        "--output",
        type=Path,
        default=Path("data/MEDIA_HEALTH_EXPORT.json"),
        help="Sortie JSON",
    )
    ap.add_argument(
        "--csv",
        type=Path,
        default=None,
        help="Si défini, écrit aussi un CSV compact (id, name, tier, health, 72h, diagnostic)",
    )
    args = ap.parse_args()

    data = asyncio.run(_run())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"JSON: {args.output}")

    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        fields = [
            "id",
            "name",
            "country_code",
            "tier",
            "tier_band",
            "health_status",
            "articles_72h",
            "consecutive_empty_collection_runs",
            "diagnostic_bucket",
            "last_collected_at",
        ]
        with args.csv.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            w.writeheader()
            for s in data["sources"]:
                w.writerow({k: s.get(k, "") for k in fields})
        print(f"CSV: {args.csv}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Erreur: {exc}", file=sys.stderr)
        sys.exit(1)
