"""Pays canoniques (affichage FR) et cibles de couverture pour la revue de presse."""

from __future__ import annotations

COUNTRY_CANONICAL: dict[str, str] = {
    "LB": "Liban",
    "IL": "Israel",
    "IR": "Iran",
    "SA": "Arabie saoudite",
    "AE": "Emirats arabes unis",
    "TR": "Turquie",
    "IQ": "Irak",
    "SY": "Syrie",
    "QA": "Qatar",
    "JO": "Jordanie",
    "KW": "Koweit",
    "BH": "Bahrein",
    "OM": "Oman",
    "EG": "Egypte",
    "US": "Etats-Unis",
    "GB": "Royaume-Uni",
    "FR": "France",
    "DZ": "Algerie",
    "YE": "Yemen",
}

COVERAGE_TARGET_COUNTRIES: list[str] = [
    "LB",
    "IL",
    "IR",
    "SA",
    "TR",
    "IQ",
    "QA",
    "AE",
    "KW",
]


def country_label_fr(code: str) -> str:
    """Libellé français pour un code ISO2 (fallback : code)."""
    c = (code or "").strip().upper()
    return COUNTRY_CANONICAL.get(c, c or "?")
