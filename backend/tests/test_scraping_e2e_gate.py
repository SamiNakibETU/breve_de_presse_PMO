"""
Gate CI optionnel : définir MEMW_SCRAPING_E2E_REPORT vers un JSON produit par
`python -m src.scripts.verify_scrape_one_per_rubrique` pour faire échouer la build
si le taux de PASS sur la matrice est sous le seuil.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

REPORT_ENV = "MEMW_SCRAPING_E2E_REPORT"
MIN_PASS_RATIO_ENV = "MEMW_SCRAPING_E2E_MIN_PASS_RATIO"


def _load_report(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.skipif(
    not os.environ.get(REPORT_ENV),
    reason=f"Définir {REPORT_ENV}=chemin/vers/SCRAPING_E2E_MATRIX.json pour activer le gate",
)
def test_scraping_e2e_matrix_pass_ratio() -> None:
    raw = os.environ[REPORT_ENV]
    path = Path(raw)
    assert path.is_file(), f"Rapport introuvable: {path}"
    data = _load_report(path)
    matrix = data.get("rubrique_matrix")
    assert matrix and isinstance(matrix, list), "rubrique_matrix manquant (utiliser verify_scrape_one_per_rubrique)"
    n = len(matrix)
    n_pass = sum(1 for r in matrix if r.get("result") == "PASS")
    ratio = n_pass / n if n else 0.0
    min_ratio = float(os.environ.get(MIN_PASS_RATIO_ENV) or "0.85")
    assert ratio >= min_ratio, (
        f"Taux PASS {ratio:.2%} < {min_ratio:.2%} ({n_pass}/{n}). "
        "Voir le rapport JSON pour FAIL vs FAIL_FILTRE."
    )
