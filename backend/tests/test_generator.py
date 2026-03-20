from datetime import datetime, timezone

import pytest

from src.services.generator import (
    MOIS_FR,
    PressReviewGenerator,
    _format_date_fr,
    _normalize_olj_block,
    _validate_olj_block,
)


class TestFormatDateFr:
    def test_known_date(self):
        dt = datetime(2026, 3, 18, tzinfo=timezone.utc)
        assert _format_date_fr(dt) == "18 mars 2026"

    def test_single_digit_day(self):
        dt = datetime(2026, 1, 5, tzinfo=timezone.utc)
        assert _format_date_fr(dt) == "5 janvier 2026"

    def test_none_input(self):
        assert _format_date_fr(None) == "Date inconnue"

    def test_all_months(self):
        for month_num, month_name in MOIS_FR.items():
            dt = datetime(2026, month_num, 15, tzinfo=timezone.utc)
            result = _format_date_fr(dt)
            assert month_name in result
            assert "2026" in result


class TestLanguageAndCountryMaps:
    def test_language_map_completeness(self):
        from src.services.generator import LANGUAGE_MAP

        expected = {"ar", "en", "he", "fa", "tr", "fr", "ku"}
        assert set(LANGUAGE_MAP.keys()) == expected

    def test_country_map_completeness(self):
        from src.services.generator import COUNTRY_MAP

        assert "LB" in COUNTRY_MAP
        assert "IL" in COUNTRY_MAP
        assert "IR" in COUNTRY_MAP
        assert COUNTRY_MAP["LB"] == "Liban"


class TestValidateOljBlock:
    def test_valid_minimal_block(self):
        block = """« Thèse assertive percutante »

Résumé : """ + ("mot " * 160) + """

Fiche :
Article publié dans Test Media
Le 18 mars 2026
Langue originale : anglais
Pays du média : Jordanie
Nom de l'auteur : Jane Doe
"""
        ok, issues = _validate_olj_block(block)
        assert ok, issues

    def test_detects_missing_fiche(self):
        ok, issues = _validate_olj_block("« x »\nRésumé : " + ("w " * 150))
        assert not ok
        assert any("fiche" in i for i in issues)

    def test_extract_summary_used(self):
        s = PressReviewGenerator._extract_summary(
            "« t »\nRésumé : " + ("a " * 140) + "\nFiche :\nx",
        )
        assert s and len(s.split()) >= 130


class TestNormalizeOljBlock:
    def _base_tail(self) -> str:
        return """
Fiche :
Article publié dans Test Media
Le 18 mars 2026
Langue originale : anglais
Pays du média : Jordanie
Nom de l'auteur : Jane Doe
"""

    def test_ascii_quotes_to_french_guillemets(self):
        summary = "mot " * 160
        raw = f'"Thèse assertive percutante"\n\n{summary}\n{self._base_tail()}'
        out = _normalize_olj_block(raw)
        assert "«" in out and "»" in out
        ok, issues = _validate_olj_block(out)
        assert ok, issues

    def test_resume_colon_normalized(self):
        summary = "mot " * 160
        raw = f"« t »\n\nRésumé:{summary}\n{self._base_tail()}"
        out = _normalize_olj_block(raw)
        assert "Résumé :" in out
        ok, issues = _validate_olj_block(out)
        assert ok, issues

    def test_inserts_resume_prefix_when_missing(self):
        summary = "mot " * 160
        raw = f"« t »\n\n{summary}\n{self._base_tail()}"
        out = _normalize_olj_block(raw)
        assert out.split("\n")[2].strip().startswith("Résumé :") or any(
            ln.strip().startswith("Résumé :") for ln in out.split("\n")
        )
        ok, issues = _validate_olj_block(out)
        assert ok, issues
