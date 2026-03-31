"""
Compare le CSV « media revue » (ou MEDIA_REVUE_REGISTRY.json) aux lignes `media_sources` en base.

Usage (depuis backend/) :
  python -m src.scripts.reconcile_media_csv_db --csv "../docs/sources/media-revue-sheet1.csv"
  python -m src.scripts.reconcile_media_csv_db --csv path.csv --hints-out data/RECONCILE_HINTS.txt

Sans argument : si « media revue - Sheet1.csv » existe à la racine du dépôt, il est utilisé ;
sinon data/MEDIA_REVUE_REGISTRY.json.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select

from src.database import get_session_factory, init_db
from src.models.media_source import MediaSource
from src.scripts.import_media_revue_csv import load_revue_media_entries_from_csv
from src.scripts.media_revue_paths import default_media_revue_csv_path

REGISTRY_DEFAULT = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REVUE_REGISTRY.json"


def _hubs_from_db_row(s: MediaSource) -> list[str]:
    raw = (s.opinion_hub_urls_json or "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
    except json.JSONDecodeError:
        return []
    return []


async def _reconcile(
    *,
    csv_path: Path | None,
    hints_out: Path | None,
) -> dict:
    await init_db()
    if csv_path is not None:
        if not csv_path.is_file():
            raise FileNotFoundError(str(csv_path))
        expected = {m["id"]: m for m in load_revue_media_entries_from_csv(csv_path)}
        source_label = str(csv_path)
    else:
        if not REGISTRY_DEFAULT.is_file():
            raise FileNotFoundError(
                f"{REGISTRY_DEFAULT} manquant — exécute import_media_revue_csv ou passe --csv"
            )
        reg = json.loads(REGISTRY_DEFAULT.read_text(encoding="utf-8"))
        expected = {m["id"]: m for m in reg.get("media", [])}
        source_label = str(REGISTRY_DEFAULT)

    factory = get_session_factory()
    async with factory() as db:
        rows = (await db.execute(select(MediaSource))).scalars().all()
    by_id = {r.id: r for r in rows}

    missing_in_db = sorted(set(expected.keys()) - set(by_id.keys()))
    mismatches: list[dict] = []
    hints: list[str] = []

    for mid, m in expected.items():
        row = by_id.get(mid)
        if not row:
            hints.append(f"-- missing row: seed_media needed for id={mid} name={m.get('name')}")
            continue
        db_hubs = set(_hubs_from_db_row(row))
        csv_hubs = list(m.get("opinion_hub_urls") or [])
        exp_hubs = set(csv_hubs)
        if exp_hubs != db_hubs and exp_hubs:
            mismatches.append(
                {
                    "id": mid,
                    "field": "opinion_hub_urls_json",
                    "db_count": len(db_hubs),
                    "csv_count": len(exp_hubs),
                    "only_in_csv": sorted(exp_hubs - db_hubs)[:12],
                    "only_in_db": sorted(db_hubs - exp_hubs)[:12],
                }
            )
            hints.append(
                f"-- {mid}: mettre à jour opinion_hub_urls_json depuis CSV "
                f"(+{len(exp_hubs - db_hubs)} / -{len(db_hubs - exp_hubs)})"
            )
        if (m.get("url") or "").strip() and (row.url or "").strip() != (m.get("url") or "").strip():
            mismatches.append(
                {
                    "id": mid,
                    "field": "url",
                    "db": (row.url or "")[:120],
                    "csv": (m.get("url") or "")[:120],
                }
            )
        cm_csv = (m.get("collection_method") or "opinion_hub").strip()
        cm_db = (row.collection_method or "").strip()
        if cm_csv != cm_db:
            mismatches.append(
                {
                    "id": mid,
                    "field": "collection_method",
                    "db": cm_db,
                    "csv": cm_csv,
                }
            )

    report = {
        "source": source_label,
        "expected_count": len(expected),
        "db_total_rows": len(by_id),
        "missing_in_db": missing_in_db,
        "hub_or_field_mismatches": mismatches,
    }

    if hints_out:
        hints_out.parent.mkdir(parents=True, exist_ok=True)
        hints_out.write_text(
            "\n".join(
                [
                    "# Indices manuels (pas d'écriture auto en base)",
                    f"# source: {source_label}",
                    *hints,
                ]
            )
            + "\n",
            encoding="utf-8",
        )
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Réconciliation CSV revue ↔ media_sources")
    ap.add_argument("--csv", type=Path, default=None, help="Chemin vers le CSV revue")
    ap.add_argument(
        "--registry-only",
        action="store_true",
        help="Forcer MEDIA_REVUE_REGISTRY.json (ignorer le CSV à la racine)",
    )
    ap.add_argument(
        "--hints-out",
        type=Path,
        default=None,
        help="Fichier texte avec pistes de correction manuelle",
    )
    args = ap.parse_args()

    if args.registry_only:
        csv_resolved: Path | None = None
    elif args.csv:
        csv_resolved = args.csv
    else:
        default_csv = default_media_revue_csv_path()
        csv_resolved = default_csv if default_csv.is_file() else None

    try:
        report = asyncio.run(
            _reconcile(csv_path=csv_resolved, hints_out=args.hints_out)
        )
    except FileNotFoundError as e:
        print(e, file=sys.stderr)
        sys.exit(1)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["missing_in_db"]:
        print(
            f"\n⚠ {len(report['missing_in_db'])} id(s) du CSV absents en base (seed / fusion registre).",
            file=sys.stderr,
        )
    if report["hub_or_field_mismatches"]:
        print(
            f"\n⚠ {len(report['hub_or_field_mismatches'])} écart(s) URL/hubs/collection_method.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
