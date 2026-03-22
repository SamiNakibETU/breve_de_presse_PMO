"""API régie — lecture logs (Bearer)."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client_with_internal_key(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("INTERNAL_API_KEY", "test-internal-key-for-bearer-auth")
    import src.config as cfg

    cfg._settings = None
    from src.app import create_app

    return TestClient(create_app())


def test_regie_pipeline_logs_401_without_auth(client_with_internal_key: TestClient) -> None:
    r = client_with_internal_key.get("/api/regie/pipeline-debug-logs")
    assert r.status_code == 401


def test_regie_llm_logs_401_without_auth(client_with_internal_key: TestClient) -> None:
    r = client_with_internal_key.get("/api/regie/llm-call-logs")
    assert r.status_code == 401


def test_regie_dedup_feedback_401_post(client_with_internal_key: TestClient) -> None:
    r = client_with_internal_key.post(
        "/api/regie/dedup-feedback",
        json={"article_id": "00000000-0000-0000-0000-000000000001", "note": "x"},
    )
    assert r.status_code == 401
