"""Tests unitaires — payload JSON génération revue par sujet."""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

from src.services.edition_review_generator import _build_articles_json


def test_build_articles_json_shape() -> None:
    ms = MagicMock()
    ms.name = "Test Media"
    ms.country_code = "LB"

    a = MagicMock()
    a.id = uuid.uuid4()
    a.media_source = ms
    a.author = "A. Auteur"
    a.published_at = datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc)
    a.source_language = "ar"
    a.thesis_summary_fr = "« Thèse »"
    a.summary_fr = "Résumé."
    a.content_translated_fr = "Corps FR."

    raw = _build_articles_json([a])
    data = json.loads(raw)
    assert len(data) == 1
    assert data[0]["media_name"] == "Test Media"
    assert data[0]["country_code"] == "LB"
    assert data[0]["published_at_formatted"] == "20/03/2026"
    assert "translation_fr" in data[0]
