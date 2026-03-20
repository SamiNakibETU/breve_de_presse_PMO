from src.services.metrics import inc, prometheus_text, snapshot


def test_metrics_inc_and_snapshot():
    inc("test.counter", 2)
    inc("test.counter")
    s = snapshot()
    assert s.get("test.counter") == 3


def test_prometheus_export_contains_olj_metrics():
    text = prometheus_text()
    assert "olj_pipeline_tasks_created_total" in text
    assert "olj_llm_requests_total" in text
