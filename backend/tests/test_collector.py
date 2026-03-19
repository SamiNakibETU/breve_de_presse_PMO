import hashlib

import pytest

from src.services.collector import _url_hash, _parse_date, _extract_author


class TestUrlHash:
    def test_deterministic(self):
        url = "https://example.com/article"
        assert _url_hash(url) == _url_hash(url)

    def test_sha256(self):
        url = "https://example.com/article"
        expected = hashlib.sha256(url.encode()).hexdigest()
        assert _url_hash(url) == expected

    def test_strips_whitespace(self):
        assert _url_hash("  https://example.com  ") == _url_hash("https://example.com")


class TestParseDate:
    def test_returns_none_for_empty(self):
        class FakeEntry:
            pass

        assert _parse_date(FakeEntry()) is None

    def test_parses_published_parsed(self):
        import time
        from datetime import datetime, timezone
        from time import mktime

        tpl = (2026, 3, 18, 12, 0, 0, 0, 77, -1)

        class FakeEntry:
            published_parsed = time.struct_time(tpl)

        result = _parse_date(FakeEntry())
        assert result is not None
        expected = datetime.fromtimestamp(mktime(tpl), tz=timezone.utc)
        assert result == expected


class TestExtractAuthor:
    def test_from_author_attr(self):
        class FakeEntry:
            author = "John Doe"

        assert _extract_author(FakeEntry()) == "John Doe"

    def test_from_authors_list(self):
        class FakeEntry:
            authors = [{"name": "Jane Doe"}]

        assert _extract_author(FakeEntry()) == "Jane Doe"

    def test_returns_none(self):
        class FakeEntry:
            pass

        assert _extract_author(FakeEntry()) is None
