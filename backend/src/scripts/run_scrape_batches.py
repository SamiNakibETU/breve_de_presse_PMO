"""
Exécute la validation hubs sur un lot fixe de médias (ordre stable du registre).

Sortie : data/SCRAPING_BATCH_{index:04d}.json (résumé + diagnostics par hub).

Usage (depuis backend/) :
  python -m src.scripts.run_scrape_batches --batch-index 0
  python -m src.scripts.run_scrape_batches --batch-index 1 --batch-size 5 --no-article-sample
  python -m src.scripts.run_scrape_batches --batch-index 0 --wayback-on-failure
  python -m src.scripts.run_scrape_batches --list-batches
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

from src.scripts.validate_media_hubs import REGISTRY_PATH, run_validation

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def list_sorted_media_ids(registry_path: Path, *, only_active: bool) -> list[str]:
    data = json.loads(registry_path.read_text(encoding="utf-8"))
    media = data.get("media", [])
    if only_active:
        media = [m for m in media if m.get("is_active", True)]
    ids = [str(m["id"]) for m in media if m.get("id")]
    return sorted(ids)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Validation hubs par lot (registre trié par id).",
    )
    ap.add_argument("--batch-size", type=int, default=5, help="Taille du lot (défaut 5)")
    ap.add_argument("--batch-index", type=int, default=0, help="Index du lot (0-based)")
    ap.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Fichier JSON de sortie (défaut: data/SCRAPING_BATCH_NNNN.json)",
    )
    ap.add_argument(
        "--registry",
        type=Path,
        default=None,
        help="Chemin vers MEDIA_REVUE_REGISTRY.json",
    )
    ap.add_argument(
        "--no-article-sample",
        action="store_true",
        help="Ne pas télécharger d’article (plus rapide)",
    )
    ap.add_argument(
        "--include-inactive",
        action="store_true",
        help="Inclure les médias is_active=false dans l’ordre global",
    )
    ap.add_argument(
        "--pause-seconds",
        type=float,
        default=0.0,
        help="Pause après le lot (secondes), utile en enchaînant plusieurs commandes",
    )
    ap.add_argument(
        "--list-batches",
        action="store_true",
        help="Affiche le nombre de lots et quitte",
    )
    ap.add_argument(
        "--wayback-on-failure",
        action="store_true",
        help="Si fetch hub en echec, ajouter wayback_availability (API archive.org) au rapport JSON",
    )
    args = ap.parse_args()

    reg = args.registry or REGISTRY_PATH
    if not reg.is_file():
        print(f"Registre introuvable: {reg}", file=sys.stderr)
        sys.exit(1)

    all_ids = list_sorted_media_ids(reg, only_active=not args.include_inactive)
    batch_size = max(1, args.batch_size)
    n_batches = (len(all_ids) + batch_size - 1) // batch_size if all_ids else 0

    if args.list_batches:
        print(f"Médias (tri id) : {len(all_ids)} — lots de {batch_size} : {n_batches}")
        sys.exit(0)

    if args.batch_index < 0:
        print("--batch-index doit être >= 0", file=sys.stderr)
        sys.exit(1)

    start = args.batch_index * batch_size
    slice_ids = all_ids[start : start + batch_size]
    batch_id = f"{args.batch_index:04d}"

    if not slice_ids:
        print(
            f"Aucun média pour le lot {batch_id} (index {args.batch_index}, taille {batch_size}).",
            file=sys.stderr,
        )
        sys.exit(1)

    out_path = args.output
    if out_path is None:
        out_path = DATA_DIR / f"SCRAPING_BATCH_{batch_id}.json"

    print(
        f"Lot {batch_id} : {len(slice_ids)} média(x) — ids : {', '.join(slice_ids)}",
    )

    report = asyncio.run(
        run_validation(
            max_media=None,
            sample_article=not args.no_article_sample,
            only_active=not args.include_inactive,
            only_ids=slice_ids,
            registry_path=reg,
            batch_id=batch_id,
            batch_index=args.batch_index,
            batch_size=batch_size,
            wayback_on_failure=args.wayback_on_failure,
        )
    )
    report["batch_media_ids"] = slice_ids

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    s = report["summary"]
    print(
        f"OK fetch hub : {s['hubs_fetch_ok']}/{s['hubs_total']} — "
        f">={s.get('min_links_target', 3)} liens : {s.get('hubs_meeting_min_links', 0)}",
    )
    print(f"Rapport : {out_path.resolve()}")

    if args.pause_seconds > 0:
        time.sleep(args.pause_seconds)


if __name__ == "__main__":
    main()
