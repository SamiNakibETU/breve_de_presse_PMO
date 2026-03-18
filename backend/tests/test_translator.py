import json

import pytest

from src.services.translator import _parse_llm_json


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
