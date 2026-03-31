"""
Observation réseau Playwright pour une URL de hub (recherche / diagnostic).

Usage (depuis backend/) :
  python -m src.scripts.observe_hub_network --url https://example.com/opinion
  python -m src.scripts.observe_hub_network --url https://example.com --output data/obs_network.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from src.services.hub_network_observe import observe_hub_network


def main() -> None:
    ap = argparse.ArgumentParser(description="Observe le trafic réseau (Playwright) pour une URL.")
    ap.add_argument("--url", required=True, help="URL complète (hub ou article)")
    ap.add_argument("--output", type=Path, default=None, help="Fichier JSON de sortie")
    ap.add_argument("--wait-ms", type=int, default=3500, help="Attente après domcontentloaded (ms)")
    ap.add_argument(
        "--no-block-sw",
        action="store_true",
        help="Ne pas bloquer les service workers (défaut: blocage pour observer tout le trafic)",
    )
    args = ap.parse_args()

    report = asyncio.run(
        observe_hub_network(
            args.url.strip(),
            wait_after_load_ms=max(500, args.wait_ms),
            block_service_workers=not args.no_block_sw,
        ),
    )
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
        print(f"Écrit : {args.output.resolve()}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
