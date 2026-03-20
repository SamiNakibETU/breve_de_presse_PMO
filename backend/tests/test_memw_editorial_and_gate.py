"""Tests MEMW : gate heuristique, override ar/fa, parsing gate LLM."""

import pytest

from src.services.editorial_scope import (
    needs_ingestion_llm_gate,
    needs_post_extract_llm_gate,
    override_langid_ar_fa,
    should_ingest_rss_entry,
    snippet_for_ingestion_gate,
)
from src.services.ingestion_llm_gate import _parse_pertinent


def test_needs_ingestion_llm_gate_weak_keywords_only() -> None:
    assert should_ingest_rss_entry(
        "Humanitarian crisis on the border",
        "The situation remains difficult.",
        uses_opinion_feed=False,
    )
    assert needs_ingestion_llm_gate(
        "Humanitarian crisis on the border",
        "The situation remains difficult.",
        uses_opinion_feed=False,
    )


def test_needs_ingestion_llm_gate_strong_signal_skips_llm() -> None:
    assert should_ingest_rss_entry(
        "Israeli airstrike reported near border",
        "Military sources confirmed explosions.",
        uses_opinion_feed=False,
    )
    assert not needs_ingestion_llm_gate(
        "Israeli airstrike reported near border",
        "Military sources confirmed explosions.",
        uses_opinion_feed=False,
    )


def test_needs_ingestion_llm_gate_opinion_feed_off() -> None:
    assert not needs_ingestion_llm_gate(
        "Diplomatic talks",
        "Crisis continues",
        uses_opinion_feed=True,
    )


def test_override_langid_ar_fa() -> None:
    assert override_langid_ar_fa("ar", "IR") == "fa"
    assert override_langid_ar_fa("fa", "LB") == "ar"
    assert override_langid_ar_fa("en", "IR") == "en"


@pytest.mark.parametrize(
    "raw,expected",
    [
        ('{"pertinent": true}', True),
        ('{"pertinent": false}', False),
        ("```json\n{\"pertinent\": true}\n```", True),
    ],
)
def test_parse_pertinent(raw: str, expected: bool) -> None:
    assert _parse_pertinent(raw) is expected


def test_snippet_for_ingestion_gate_truncates() -> None:
    long = "x" * 3000
    sn = snippet_for_ingestion_gate(long, max_chars=1100)
    assert len(sn) == 1100


def test_needs_post_extract_llm_gate_matches_body_weak_signal() -> None:
    assert needs_post_extract_llm_gate(
        "Humanitarian crisis on the border",
        "The situation remains difficult for civilians.",
    )
