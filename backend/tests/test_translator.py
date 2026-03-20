import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from tenacity import RetryError

from src.services.translator import (
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
