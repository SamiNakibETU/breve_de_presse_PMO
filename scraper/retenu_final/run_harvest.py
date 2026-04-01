#!/usr/bin/env python3
"""
CLI : recolte d'articles depuis le registre media (voir README.md dans ce dossier).

Emplacement : ``scraper/retenu_final/run_harvest.py``
Depuis la racine du depot Projet_guerre, apres ``cd scraper/retenu_final`` :

    python run_harvest.py
    python run_harvest.py --only il_haaretz --limit 1
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path


def main() -> int:
    here = Path(__file__).resolve().parent
    scraper_root = here.parent
    project_root = scraper_root.parent
    sys.path.insert(0, str(here))

    default_reg = project_root / "backend" / "data" / "MEDIA_REVUE_REGISTRY.json"
    default_out = scraper_root / "output" / "harvest"

    ap = argparse.ArgumentParser(description="Recolte articles opinion par media (OLJ)")
    ap.add_argument("--registry", type=Path, default=default_reg, help="MEDIA_REVUE_REGISTRY.json")
    ap.add_argument("--output", type=Path, default=default_out, help="Repertoire des runs")
    ap.add_argument("--articles", type=int, default=3, help="Articles par media")
    ap.add_argument("--min-words", type=int, default=120, help="Mots minimum par article")
    ap.add_argument("--quiet", action="store_true", help="Moins de logs")
    ap.add_argument("--only", action="append", default=[], help="Filtrer par id media")
    ap.add_argument("--limit", type=int, default=0, help="Max medias (0 = tous)")
    args = ap.parse_args()

    if not args.registry.is_file():
        print(f"Registre introuvable: {args.registry}", file=sys.stderr)
        return 1

    from olj_revue.harvest import run_full_harvest

    only = [x for x in args.only if x]
    lim = args.limit if args.limit > 0 else None
    summary = asyncio.run(
        run_full_harvest(
            args.registry,
            args.output,
            articles_target=args.articles,
            min_article_words=args.min_words,
            verbose=not args.quiet,
            only_ids=only or None,
            limit=lim,
        )
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2)[:8000])
    if summary["media_failed"] > 0:
        return 2
    if summary["media_partial"] > 0:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
