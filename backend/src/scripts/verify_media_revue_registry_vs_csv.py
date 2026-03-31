"""
Vérifie que `data/MEDIA_REVUE_REGISTRY.json` correspond au CSV « media revue ».

Le JSON doit être régénéré après chaque modification du CSV :
  python -m src.scripts.import_media_revue_csv

Usage (depuis backend/) :
  python -m src.scripts.verify_media_revue_registry_vs_csv
  python -m src.scripts.verify_media_revue_registry_vs_csv --fix-metadata
    → réécrit seulement metadata.source_csv + count dans le JSON (pas le contenu media).

Code de sortie : 0 OK, 1 écarts détectés, 2 CSV ou JSON introuvable.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from src.scripts.import_media_revue_csv import load_revue_media_entries_from_csv
from src.scripts.media_revue_paths import DEFAULT_MEDIA_REVUE_CSV_NAME, default_media_revue_csv_path

REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REVUE_REGISTRY.json"


def _norm_media(m: dict) -> dict:
    """Champs comparés (ordre des hubs normalisé)."""
    hubs = sorted(str(x).strip() for x in (m.get("opinion_hub_urls") or []) if str(x).strip())
    return {
        "id": m.get("id"),
        "name": (m.get("name") or "").strip(),
        "country_code": (m.get("country_code") or "").strip(),
        "url": (m.get("url") or "").strip(),
        "is_active": bool(m.get("is_active", True)),
        "opinion_hub_urls": hubs,
        "collection_method": (m.get("collection_method") or "").strip(),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Vérifie alignement CSV ↔ MEDIA_REVUE_REGISTRY.json")
    ap.add_argument("--csv", type=Path, default=None, help="CSV (défaut : racine repo / media revue - Sheet1.csv)")
    ap.add_argument(
        "--fix-metadata",
        action="store_true",
        help="Met à jour metadata dans le JSON (sans régénérer les médias)",
    )
    args = ap.parse_args()

    csv_path = args.csv if args.csv else default_media_revue_csv_path()
    if not csv_path.is_file():
        print(
            f"ERREUR: CSV introuvable: {csv_path}\n"
            f"  Place « {DEFAULT_MEDIA_REVUE_CSV_NAME} » à la racine du dépôt, "
            f"dans archive/, ou passe --csv CHEMIN.",
            file=sys.stderr,
        )
        sys.exit(2)

    if not REGISTRY_PATH.is_file():
        print(f"ERREUR: {REGISTRY_PATH} introuvable. Lance: python -m src.scripts.import_media_revue_csv", file=sys.stderr)
        sys.exit(2)

    from_csv = {m["id"]: _norm_media(m) for m in load_revue_media_entries_from_csv(csv_path)}
    reg_raw = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    from_json = {m["id"]: _norm_media(m) for m in reg_raw.get("media", []) if m.get("id")}

    ids_csv = set(from_csv.keys())
    ids_json = set(from_json.keys())

    only_csv = sorted(ids_csv - ids_json)
    only_json = sorted(ids_json - ids_csv)
    field_diffs: list[dict] = []

    for mid in sorted(ids_csv & ids_json):
        a, b = from_csv[mid], from_json[mid]
        if a != b:
            field_diffs.append({"id": mid, "csv": a, "json": b})

    ok = not only_csv and not only_json and not field_diffs

    if args.fix_metadata and REGISTRY_PATH.is_file():
        reg_raw["metadata"] = {
            **(reg_raw.get("metadata") or {}),
            "source_csv": csv_path.name,
            "count": len(from_json),
            "verified_against_csv": str(csv_path.resolve()),
        }
        REGISTRY_PATH.write_text(json.dumps(reg_raw, ensure_ascii=False, indent=2), encoding="utf-8")
        print("metadata du JSON mis à jour (--fix-metadata). Les écarts de contenu restent listés ci-dessous.")

    report = {
        "csv_path": str(csv_path.resolve()),
        "registry_path": str(REGISTRY_PATH.resolve()),
        "count_csv": len(from_csv),
        "count_json": len(from_json),
        "only_in_csv": only_csv,
        "only_in_json": only_json,
        "field_mismatches": field_diffs,
        "aligned": ok,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if ok:
        print("\nOK : le registre JSON correspond au CSV (ids + champs suivis).")
        sys.exit(0)

    print(
        "\nÉCARTS : régénère le JSON depuis le CSV puis seed si besoin :\n"
        "  python -m src.scripts.import_media_revue_csv\n"
        "  python -m src.scripts.seed_media",
        file=sys.stderr,
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
