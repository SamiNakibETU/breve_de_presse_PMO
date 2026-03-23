"""Endpoint public des cibles de couverture géographique."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("INTERNAL_API_KEY", "test-internal-key-for-bearer-auth")
    import src.config as cfg

    cfg._settings = None
    from src.app import create_app

    return TestClient(create_app())


def test_coverage_targets_ok(client: TestClient) -> None:
    r = client.get("/api/config/coverage-targets")
    assert r.status_code == 200
    data = r.json()
    assert "country_codes" in data
    assert "labels_fr" in data
    assert isinstance(data["country_codes"], list)
    assert len(data["country_codes"]) >= 1
    assert data["labels_fr"][data["country_codes"][0]]
