"""
Enchaîne : import CSV → vérif alignement JSON ↔ CSV → validation hubs + 1 article par rubrique.

Le CSV est cherché à la racine du dépôt puis dans archive/ (voir media_revue_paths).

Usage (depuis backend/) :
  python -m src.scripts.run_full_csv_hub_scrape
  python -m src.scripts.run_full_csv_hub_scrape --skip-import   # JSON déjà aligné
  python -m src.scripts.run_full_csv_hub_scrape --no-article-sample
"""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

from src.scripts.media_revue_paths import resolve_media_revue_csv_path
from src.scripts.validate_media_hubs import run_validation
from src.scripts.verify_scrape_one_per_rubrique import _flatten_matrix


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Import CSV revue, vérif alignement, puis scrape E2E (1 article / hub).",
    )
    ap.add_argument(
        "--skip-import",
        action="store_true",
        help="Ne pas régénérer MEDIA_REVUE_REGISTRY.json (déjà importé depuis le CSV)",
    )
    ap.add_argument(
        "--no-article-sample",
        action="store_true",
        help="Plus rapide : pas d’extraction d’article (diagnostic hubs seulement)",
    )
    ap.add_argument(
        "--output",
        type=Path,
        default=Path("data/SCRAPING_E2E_FULL_CSV.json"),
        help="Rapport JSON (résumé + rubrique_matrix)",
    )
    ap.add_argument(
        "--strict-exit-code",
        action="store_true",
        help="Code 1 si une rubrique est en FAIL (hors FAIL_FILTRE)",
    )
    ap.add_argument(
        "--max-media",
        type=int,
        default=None,
        help="Limiter le nombre de médias (ordre du registre, test uniquement)",
    )
    ap.add_argument(
        "--ids",
        type=str,
        default=None,
        help="Filtrer par ids média (virgules), ex. ae_gulf_news,bh_al_watan",
    )
    args = ap.parse_args()
    only_ids = [x.strip() for x in args.ids.split(",")] if args.ids else None

    backend_dir = Path(__file__).resolve().parent.parent.parent
    csv_path = resolve_media_revue_csv_path()
    if csv_path is None:
        print(
            "CSV introuvable : ajoutez « media revue - Sheet1.csv » à la racine du dépôt "
            f"({backend_dir.parent}) ou dans archive/.",
            file=sys.stderr,
        )
        sys.exit(2)

    print(f"CSV source : {csv_path.resolve()}")

    if not args.skip_import:
        r = subprocess.run(
            [sys.executable, "-m", "src.scripts.import_media_revue_csv", str(csv_path)],
            cwd=backend_dir,
            check=False,
        )
        if r.returncode != 0:
            sys.exit(r.returncode)

    r = subprocess.run(
        [sys.executable, "-m", "src.scripts.verify_media_revue_registry_vs_csv", "--csv", str(csv_path)],
        cwd=backend_dir,
        check=False,
    )
    if r.returncode != 0:
        print(
            "Le registre ne correspond pas au CSV : corrigez puis relancez, "
            "ou régénérez sans --skip-import.",
            file=sys.stderr,
        )
        sys.exit(1)

    report = asyncio.run(
        run_validation(
            max_media=args.max_media,
            sample_article=not args.no_article_sample,
            only_active=True,
            only_ids=only_ids,
            registry_path=None,
        )
    )
    report["rubrique_matrix"] = _flatten_matrix(report)
    report["source_csv_used"] = str(csv_path.resolve())

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    mx = report["rubrique_matrix"]
    n_pass = sum(1 for row in mx if row["result"] == "PASS")
    n_fail = sum(1 for row in mx if row["result"] == "FAIL")
    n_filt = sum(1 for row in mx if row["result"] == "FAIL_FILTRE")
    print(f"Rubriques : {len(mx)} — PASS: {n_pass} — FAIL: {n_fail} — FAIL_FILTRE: {n_filt}")
    print(f"Rapport : {args.output.resolve()}")

    if args.strict_exit_code and n_fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
