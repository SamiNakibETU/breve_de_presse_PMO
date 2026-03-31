"""
Phase testing plan MEMW : 1 article complet par URL de rubrique (hubs) — piloté CSV ou registre.

1) Option --csv : régénère un registre temporaire depuis le CSV puis valide.
2) Sinon : utilise data/MEDIA_REVUE_REGISTRY.json (comme validate_media_hubs).

Ajoute une matrice aplatie `rubrique_matrix` (PASS/FAIL/scrape vs filtre) dans le JSON de sortie.

Usage (depuis backend/) :
  python -m src.scripts.verify_scrape_one_per_rubrique --output data/SCRAPING_E2E_MATRIX.json
  python -m src.scripts.verify_scrape_one_per_rubrique
  # Si « media revue - Sheet1.csv » est à la racine du repo, il est pris par défaut.
  python -m src.scripts.verify_scrape_one_per_rubrique --strict-exit-code
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import tempfile
from pathlib import Path

from src.scripts.import_media_revue_csv import load_revue_media_entries_from_csv
from src.scripts.media_revue_paths import default_media_revue_csv_path, resolve_media_revue_csv_path
from src.scripts.validate_media_hubs import run_validation

TMP_NAME = "_TMP_SCRAPING_E2E_REGISTRY.json"


def _flatten_matrix(report: dict) -> list[dict]:
    rows: list[dict] = []
    for m in report.get("media", []):
        mid = m.get("id")
        name = m.get("name")
        for h in m.get("hubs") or []:
            hub_url = h.get("hub_url")
            sample = h.get("article_sample")
            status = "FAIL"
            detail = ""
            if not h.get("fetch_ok"):
                status = "FAIL"
                detail = "hub_fetch"
            elif not h.get("meets_min_links"):
                status = "FAIL"
                detail = "hub_pas_assez_liens"
            elif not sample:
                status = "FAIL"
                detail = "pas_echantillon"
            elif sample.get("ok"):
                status = "PASS"
            elif sample.get("substantial") and sample.get("title_ok") and not sample.get(
                "editorial_ok"
            ):
                status = "FAIL_FILTRE"
                detail = "hors_perimetre_editorial"
            else:
                status = "FAIL"
                detail = (sample.get("error") or "extrait_insuffisant")[:120]
            rows.append(
                {
                    "source_id": mid,
                    "name": name,
                    "hub_url": hub_url,
                    "result": status,
                    "detail": detail,
                    "article_url": (sample or {}).get("url"),
                    "chars": (sample or {}).get("chars"),
                    "diagnosis_class": h.get("diagnosis_class"),
                    "fetch_error": (h.get("fetch_error") or "")[:200],
                }
            )
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(
        description="E2E scraping : 1 article par rubrique (hubs CSV / registre)",
    )
    ap.add_argument(
        "--csv",
        type=Path,
        default=None,
        help="Chemin vers le CSV (sinon registre JSON stable)",
    )
    ap.add_argument(
        "--from-csv",
        action="store_true",
        help="Utilise le CSV résolu (racine du repo puis archive/) comme source des hubs, comme --csv",
    )
    ap.add_argument(
        "--output",
        type=Path,
        default=Path("data/SCRAPING_E2E_MATRIX.json"),
    )
    ap.add_argument("--max-media", type=int, default=None)
    ap.add_argument(
        "--no-article-sample",
        action="store_true",
        help="Désactive l’extraction article (non conforme au plan MEMW)",
    )
    ap.add_argument(
        "--strict-exit-code",
        action="store_true",
        help="Exit 1 si un cas FAIL (scrape / hub). FAIL_FILTRE n’échouit pas sauf --strict-include-editorial",
    )
    ap.add_argument(
        "--strict-include-editorial",
        action="store_true",
        help="Avec --strict-exit-code, traiter FAIL_FILTRE comme échec",
    )
    ap.add_argument("--ids", type=str, default=None)
    args = ap.parse_args()
    only_ids = [x.strip() for x in args.ids.split(",")] if args.ids else None

    csv_path_arg = args.csv
    if args.from_csv:
        if csv_path_arg is not None:
            print("Ne pas combiner --from-csv avec --csv.", file=sys.stderr)
            sys.exit(2)
        resolved = resolve_media_revue_csv_path()
        if resolved is None:
            print(
                "CSV introuvable : placez « media revue - Sheet1.csv » à la racine du dépôt "
                "ou dans archive/.",
                file=sys.stderr,
            )
            sys.exit(2)
        csv_path_arg = resolved

    registry_path: Path | None = None
    tmp_dir: tempfile.TemporaryDirectory[str] | None = None
    if csv_path_arg:
        if not csv_path_arg.is_file():
            print(f"CSV introuvable: {csv_path_arg}", file=sys.stderr)
            sys.exit(1)
        media = load_revue_media_entries_from_csv(csv_path_arg)
        tmp_dir = tempfile.TemporaryDirectory(prefix="memw_scrape_")
        registry_path = Path(tmp_dir.name) / TMP_NAME
        registry_path.write_text(
            json.dumps(
                {"metadata": {"source_csv": csv_path_arg.name}, "media": media},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
    try:
        report = asyncio.run(
            run_validation(
                max_media=args.max_media,
                sample_article=not args.no_article_sample,
                only_active=True,
                only_ids=only_ids,
                registry_path=registry_path,
            )
        )
    finally:
        if tmp_dir:
            tmp_dir.cleanup()

    report["rubrique_matrix"] = _flatten_matrix(report)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    mx = report["rubrique_matrix"]
    n_pass = sum(1 for r in mx if r["result"] == "PASS")
    n_fail = sum(1 for r in mx if r["result"] == "FAIL")
    n_filt = sum(1 for r in mx if r["result"] == "FAIL_FILTRE")
    print(f"Rubriques testées: {len(mx)} — PASS: {n_pass} — FAIL: {n_fail} — FAIL_FILTRE: {n_filt}")
    print(f"Rapport: {args.output}")

    if args.strict_exit_code:
        if args.strict_include_editorial and (n_fail or n_filt):
            sys.exit(1)
        if not args.strict_include_editorial and n_fail:
            sys.exit(1)


if __name__ == "__main__":
    main()
