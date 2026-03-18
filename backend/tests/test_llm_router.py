"""Tests for the hybrid LLM routing logic."""

from unittest.mock import MagicMock, patch

import pytest

from src.services.llm_router import LLMRouter, Provider


def _make_settings(**overrides):
    defaults = {
        "groq_api_key": "gsk_test",
        "cerebras_api_key": "csk_test",
        "anthropic_api_key": "sk-ant-test",
        "groq_translation_model": "llama-4-scout",
        "groq_generation_model": "llama-3.3-70b",
        "cerebras_translation_model": "qwen-3-235b",
        "anthropic_translation_model": "claude-haiku",
        "anthropic_generation_model": "claude-sonnet",
    }
    defaults.update(overrides)
    s = MagicMock()
    for k, v in defaults.items():
        setattr(s, k, v)
    return s


class TestTranslationRouting:
    @patch("src.services.llm_router.get_settings")
    def test_arabic_goes_to_cerebras(self, mock_gs):
        mock_gs.return_value = _make_settings()
        router = LLMRouter()
        provider, model = router._pick_translation("ar")
        assert provider == Provider.CEREBRAS
        assert model == "qwen-3-235b"

    @patch("src.services.llm_router.get_settings")
    def test_english_goes_to_groq(self, mock_gs):
        mock_gs.return_value = _make_settings()
        router = LLMRouter()
        provider, model = router._pick_translation("en")
        assert provider == Provider.GROQ
        assert model == "llama-4-scout"

    @patch("src.services.llm_router.get_settings")
    def test_french_goes_to_groq(self, mock_gs):
        mock_gs.return_value = _make_settings()
        router = LLMRouter()
        provider, model = router._pick_translation("fr")
        assert provider == Provider.GROQ

    @patch("src.services.llm_router.get_settings")
    def test_hebrew_goes_to_anthropic(self, mock_gs):
        mock_gs.return_value = _make_settings()
        router = LLMRouter()
        provider, model = router._pick_translation("he")
        assert provider == Provider.ANTHROPIC
        assert model == "claude-haiku"

    @patch("src.services.llm_router.get_settings")
    def test_persian_goes_to_cerebras(self, mock_gs):
        mock_gs.return_value = _make_settings()
        router = LLMRouter()
        provider, model = router._pick_translation("fa")
        assert provider == Provider.CEREBRAS

    @patch("src.services.llm_router.get_settings")
    def test_turkish_goes_to_cerebras(self, mock_gs):
        mock_gs.return_value = _make_settings()
        router = LLMRouter()
        provider, model = router._pick_translation("tr")
        assert provider == Provider.CEREBRAS


class TestFallbackRouting:
    @patch("src.services.llm_router.get_settings")
    def test_groq_only_handles_all_translation(self, mock_gs):
        mock_gs.return_value = _make_settings(cerebras_api_key="", anthropic_api_key="")
        router = LLMRouter()
        provider, _ = router._pick_translation("ar")
        assert provider == Provider.GROQ

    @patch("src.services.llm_router.get_settings")
    def test_anthropic_only_handles_all_translation(self, mock_gs):
        mock_gs.return_value = _make_settings(groq_api_key="", cerebras_api_key="")
        router = LLMRouter()
        provider, _ = router._pick_translation("en")
        assert provider == Provider.ANTHROPIC

    @patch("src.services.llm_router.get_settings")
    def test_no_keys_raises(self, mock_gs):
        mock_gs.return_value = _make_settings(
            groq_api_key="", cerebras_api_key="", anthropic_api_key=""
        )
        with pytest.raises(RuntimeError, match="No LLM provider configured"):
            LLMRouter()


class TestGenerationRouting:
    @patch("src.services.llm_router.get_settings")
    def test_generation_prefers_groq(self, mock_gs):
        mock_gs.return_value = _make_settings()
        router = LLMRouter()
        provider, model = router._pick_generation()
        assert provider == Provider.GROQ
        assert model == "llama-3.3-70b"

    @patch("src.services.llm_router.get_settings")
    def test_generation_falls_back_to_anthropic(self, mock_gs):
        mock_gs.return_value = _make_settings(groq_api_key="")
        router = LLMRouter()
        provider, model = router._pick_generation()
        assert provider == Provider.ANTHROPIC
        assert model == "claude-sonnet"
