#!/usr/bin/env python3
"""
Raccourci : execute le pipeline retenu dans ``retenu_final/``.

Documentation : ``retenu_final/README.md``.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def main() -> int:
    retenu = Path(__file__).resolve().parent / "retenu_final" / "run_harvest.py"
    spec = importlib.util.spec_from_file_location("_olj_revue_run_harvest", retenu)
    if spec is None or spec.loader is None:
        print(f"Impossible de charger: {retenu}", file=sys.stderr)
        return 1
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return int(mod.main())


if __name__ == "__main__":
    raise SystemExit(main())
