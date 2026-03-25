import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from tenacity import RetryError

from src.services.translator import (
    TranslationPipeline,
    _classify_translation_error,
    _parse_llm_json,
    _parse_translation_llm_json,
)


class TestParseLlmJson:
    def test_valid_json(self):
        data = {"key": "value", "number": 42}
        result = _parse_llm_json(json.dumps(data))
        assert result == data

    def test_json_with_markdown_fences(self):
        data = {"translated_title": "Test"}
        raw = f"```json\n{json.dumps(data)}\n```"
        result = _parse_llm_json(raw)
        assert result == data

    def test_json_embedded_in_text(self):
        data = {"summary_fr": "Un résumé"}
        raw = f'Some intro text\n{json.dumps(data)}\nSome outro text'
        result = _parse_llm_json(raw)
        assert result == data

    def test_raises_on_garbage(self):
        with pytest.raises(ValueError, match="Cannot parse JSON"):
            _parse_llm_json("this is not json at all")

    def test_unicode_content(self):
        data = {"title": "« Titre avec guillemets français »"}
        result = _parse_llm_json(json.dumps(data, ensure_ascii=False))
        assert result["title"] == "« Titre avec guillemets français »"

    def test_whitespace_stripped(self):
        data = {"key": "val"}
        raw = f"\n\n  {json.dumps(data)}  \n\n"
        result = _parse_llm_json(raw)
        assert result == data


def _fake_exc(module: str, name: str, msg: str = "x") -> Exception:
    return type(name, (Exception,), {"__module__": module})(msg)


class TestClassifyTranslationError:
    def test_json_parse(self):
        assert (
            _classify_translation_error(
                ValueError("Cannot parse JSON from LLM response: {}")
            )
            == "json_parse"
        )

    def test_value_error_other(self):
        assert _classify_translation_error(ValueError("other")) == "value_error"

    def test_retry_exhausted(self):
        assert _classify_translation_error(RetryError(None)) == "retry_exhausted"

    def test_openai_rate_limit(self):
        exc = _fake_exc("openai", "RateLimitError")
        assert _classify_translation_error(exc) == "rate_limit"

    def test_openai_llm_api(self):
        exc = _fake_exc("openai", "APIStatusError")
        assert _classify_translation_error(exc) == "llm_api"

    def test_other(self):
        assert _classify_translation_error(RuntimeError("oops")) == "other"


@pytest.mark.asyncio
async def test_parse_translation_llm_json_repair(monkeypatch):
    import src.services.translator as tr

    monkeypatch.setattr(tr, "append_provider_usage_commit", AsyncMock())
    monkeypatch.setattr(tr.settings, "translation_json_repair", True)

    valid = {
        "translated_title": "T",
        "thesis_summary": "Une thèse courte.",
        "summary_fr": " ".join(["Mot."] * 160),
        "key_quotes_fr": ["« a »"],
        "article_type": "news",
        "entities": [],
        "translation_notes": "",
    }
    router = MagicMock()
    router.translate = AsyncMock(
        return_value=json.dumps(valid, ensure_ascii=False),
    )

    data = await _parse_translation_llm_json(
        router,
        "ceci n'est pas du json {",
        "en",
    )
    assert data["translated_title"] == "T"
    router.translate.assert_awaited_once()


@pytest.mark.asyncio
async def test_parse_translation_llm_json_no_repair(monkeypatch):
    import src.services.translator as tr

    monkeypatch.setattr(tr.settings, "translation_json_repair", False)
    router = MagicMock()
    router.translate = AsyncMock()
    with pytest.raises(ValueError, match="Cannot parse JSON"):
        await _parse_translation_llm_json(router, "@@@", "en")
    router.translate.assert_not_called()


@pytest.mark.asyncio
async def test_persist_from_parsed_translation_cod_passes_article_id(monkeypatch):
    """Régression : le bloc CoD doit utiliser article.id (pas art avant assignation)."""
    import src.services.translator as tr

    article_id = uuid.uuid4()
    article = SimpleNamespace(
        id=article_id,
        published_at=datetime.now(timezone.utc),
        source_language="en",
        content_original="word " * 400,
        title_original="Titre",
        url="https://example.com/a",
    )
    source = SimpleNamespace(country_code="US", tier=1)

    monkeypatch.setattr(tr.settings, "cod_multi_pass_enabled", True)
    monkeypatch.setattr(tr.settings, "cod_multi_pass_min_relevance", 0)
    monkeypatch.setattr(tr, "append_provider_usage_commit", AsyncMock())
    monkeypatch.setattr(
        tr,
        "resolve_or_create_event_for_article",
        AsyncMock(return_value=None),
    )

    calls: list[object] = []

    async def fake_cod_dense_pass(summary: str, lang: str, aid: object) -> str:
        calls.append(aid)
        return summary + " +cod"

    mock_db = MagicMock()
    mock_db.get = AsyncMock(return_value=MagicMock())
    mock_db.commit = AsyncMock()

    @asynccontextmanager
    async def session_factory():
        yield mock_db

    # __init__ appelle get_llm_router() (lourd / réseau) : instance minimale pour ce test.
    pipeline = object.__new__(TranslationPipeline)
    pipeline._router = MagicMock()
    pipeline._factory = session_factory
    pipeline._cod_dense_pass = fake_cod_dense_pass  # type: ignore[method-assign]

    data = {
        "translated_title": "Titre",
        "thesis_summary": "Thèse courte.",
        "summary_fr": " ".join(["mot"] * 50),
        "key_quotes_fr": ["« x »"],
        "article_type": "news",
        "article_family": "news",
        "olj_topic_ids": ["other"],
        "stance_summary": "Neutre.",
        "entities": [],
        "translation_notes": "",
    }

    status = await pipeline.persist_from_parsed_translation(
        article,
        source,
        data,
        lang="en",
        is_french=False,
        en_summary_only=False,
        run_cod=True,
    )

    assert status is not None
    assert len(calls) == 2
    assert all(cid == article_id for cid in calls)
    mock_db.commit.assert_awaited()
