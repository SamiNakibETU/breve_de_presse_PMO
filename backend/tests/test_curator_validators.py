"""Invariants validate_curator_payload (MEMW v2 §5.4)."""

import uuid

from src.services.curator_service import validate_curator_payload


def _aid() -> str:
    return str(uuid.uuid4())


def test_validate_ok_minimal() -> None:
    a, b, c, d = _aid(), _aid(), _aid(), _aid()
    valid = {uuid.UUID(x) for x in (a, b, c, d)}
    data = {
        "topics": [
            {
                "title": "Un sujet",
                "recommended_articles": [
                    {"article_id": a, "justification": "x"},
                    {"article_id": b, "justification": "y"},
                ],
                "country_coverage": {"FR": 1, "LB": 1},
            },
            {
                "title": "Autre sujet",
                "recommended_articles": [
                    {"article_id": c, "justification": "z"},
                    {"article_id": d, "justification": "w"},
                ],
                "country_coverage": {"IL": 1, "IR": 1},
            },
        ]
    }
    errs = validate_curator_payload(
        data,
        valid_article_ids=valid,
        target_topics_min=2,
        target_topics_max=8,
        corpus_country_codes={"FR", "LB", "IL", "IR"},
    )
    assert errs == []


def test_invariant_5_country_coverage() -> None:
    a, b = _aid(), _aid()
    valid = {uuid.UUID(a), uuid.UUID(b)}
    data = {
        "topics": [
            {
                "title": "S1",
                "recommended_articles": [
                    {"article_id": a, "justification": "x"},
                    {"article_id": b, "justification": "y"},
                ],
                "country_coverage": {"FR": 2},
            },
        ]
    }
    errs = validate_curator_payload(
        data,
        valid_article_ids=valid,
        target_topics_min=1,
        target_topics_max=8,
        corpus_country_codes={"FR", "LB", "IL", "IR", "DE"},
    )
    assert any("INVARIANT_5" in e for e in errs)


def test_invariant_6_max_articles() -> None:
    ids = [_aid() for _ in range(41)]
    valid = {uuid.UUID(x) for x in ids}
    topics = []
    # 7 topics × 6 articles = 42 — trim to 41 by doing 6+6+6+6+6+6+5 = 41
    chunk_sizes = [6, 6, 6, 6, 6, 6, 5]
    idx = 0
    for i, sz in enumerate(chunk_sizes):
        rec = [
            {"article_id": ids[idx + j], "justification": "j"}
            for j in range(sz)
        ]
        idx += sz
        topics.append(
            {
                "title": f"S{i}",
                "recommended_articles": rec,
                "country_coverage": {"LB": sz},
            }
        )
    errs = validate_curator_payload(
        {"topics": topics},
        valid_article_ids=valid,
        target_topics_min=7,
        target_topics_max=8,
        corpus_country_codes=None,
    )
    assert any("INVARIANT_6" in e for e in errs)
