"""Auth Bearer sur endpoints de mutation (Sprint 1)."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client_with_internal_key(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("INTERNAL_API_KEY", "test-internal-key-for-bearer-auth")
    import src.config as cfg

    cfg._settings = None
    from src.app import create_app

    return TestClient(create_app())


def test_post_pipeline_401_without_authorization(client_with_internal_key: TestClient) -> None:
    r = client_with_internal_key.post("/api/pipeline")
    assert r.status_code == 401


def test_post_pipeline_401_wrong_bearer(client_with_internal_key: TestClient) -> None:
    r = client_with_internal_key.post(
        "/api/pipeline",
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert r.status_code == 401


def test_get_health_200_without_auth(client_with_internal_key: TestClient) -> None:
    r = client_with_internal_key.get("/health")
    assert r.status_code == 200
