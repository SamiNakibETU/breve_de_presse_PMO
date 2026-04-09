from src.services.metrics import (
    inc,
    prometheus_text,
    record_pipeline_run,
    record_pipeline_step,
    snapshot,
)


def test_metrics_inc_and_snapshot():
    inc("test.counter", 2)
    inc("test.counter")
    s = snapshot()
    assert s.get("test.counter") == 3


def test_prometheus_export_contains_olj_metrics():
    text = prometheus_text()
    assert "olj_pipeline_tasks_created_total" in text
    assert "olj_llm_requests_total" in text


def test_record_pipeline_step_appears_in_prometheus():
    record_pipeline_step("collection", duration_seconds=42.0, article_count=12)
    text = prometheus_text()
    assert "olj_pipeline_step_duration_seconds" in text
    assert "olj_pipeline_step_articles_total" in text


def test_record_pipeline_run_appears_in_prometheus():
    record_pipeline_run(trigger="cron_morning", outcome="ok")
    text = prometheus_text()
    assert "olj_pipeline_runs_total" in text
