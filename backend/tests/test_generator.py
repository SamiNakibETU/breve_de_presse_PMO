from datetime import datetime, timezone

import pytest

from src.services.generator import _format_date_fr, MOIS_FR


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
