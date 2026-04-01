"""Ordre des sélections par sujet (PATCH …/selection)."""

import uuid

from src.routers.editions import _dedupe_uuid_preserve_order


def test_dedupe_uuid_preserve_order_keeps_first_occurrence() -> None:
    a = uuid.uuid4()
    b = uuid.uuid4()
    c = uuid.uuid4()
    assert _dedupe_uuid_preserve_order([a, b, a, c, b]) == [a, b, c]


def test_dedupe_uuid_preserve_order_empty() -> None:
    assert _dedupe_uuid_preserve_order([]) == []
