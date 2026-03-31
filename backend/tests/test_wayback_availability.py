"""Tests parseur JSON Wayback (sans appel réseau)."""

from src.services.wayback_availability import parse_wayback_availability_json


def test_parse_empty_snapshots() -> None:
    r = parse_wayback_availability_json({"url": "https://a.com", "archived_snapshots": {}})
    assert r["closest_url"] is None
    assert r["checked"] is True


def test_parse_closest_available() -> None:
    payload = {
        "url": "https://example.com/x",
        "archived_snapshots": {
            "closest": {
                "available": True,
                "url": "http://web.archive.org/web/20200101000000/https://example.com/x",
                "timestamp": "20200101000000",
                "status": "200",
            },
        },
    }
    r = parse_wayback_availability_json(payload)
    assert r["closest_url"] is not None
    assert "web.archive.org" in r["closest_url"]
    assert r["timestamp"] == "20200101000000"
