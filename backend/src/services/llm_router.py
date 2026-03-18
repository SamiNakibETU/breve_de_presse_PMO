"""
Hybrid LLM router: picks the cheapest capable provider per task and language.

Routing strategy:
  - Arabic/Persian/Turkish/Kurdish → Cerebras (Qwen3 235B, excellent multilingual)
  - English/French                 → Groq (Llama 4 Scout, fast & cheap)
  - Hebrew                        → Anthropic (Claude Haiku, only reliable option)
  - OLJ generation                → Groq (Llama 3.3 70B, quality writing)
  - Fallback                      → any available provider
"""

from enum import Enum

import anthropic
import structlog
from openai import AsyncOpenAI

from src.config import get_settings

logger = structlog.get_logger(__name__)


class Provider(str, Enum):
    GROQ = "groq"
    CEREBRAS = "cerebras"
    ANTHROPIC = "anthropic"


_CEREBRAS_LANGS = frozenset(("ar", "fa", "tr", "ku"))
_GROQ_LANGS = frozenset(("en", "fr"))


class LLMRouter:
    """Routes LLM calls to the cheapest capable provider."""

    def __init__(self) -> None:
        s = get_settings()
        self._clients: dict[Provider, object] = {}

        if s.groq_api_key:
            self._clients[Provider.GROQ] = AsyncOpenAI(
                api_key=s.groq_api_key,
                base_url="https://api.groq.com/openai/v1",
            )
        if s.cerebras_api_key:
            self._clients[Provider.CEREBRAS] = AsyncOpenAI(
                api_key=s.cerebras_api_key,
                base_url="https://api.cerebras.ai/v1",
            )
        if s.anthropic_api_key:
            self._clients[Provider.ANTHROPIC] = anthropic.AsyncAnthropic(
                api_key=s.anthropic_api_key,
            )

        if not self._clients:
            raise RuntimeError(
                "No LLM provider configured. "
                "Set at least one of GROQ_API_KEY, CEREBRAS_API_KEY, or ANTHROPIC_API_KEY."
            )

        providers = ", ".join(p.value for p in self._clients)
        logger.info("llm_router.init", providers=providers)

    def _has(self, p: Provider) -> bool:
        return p in self._clients

    def _pick_translation(self, language: str) -> tuple[Provider, str]:
        s = get_settings()

        if language == "he" and self._has(Provider.ANTHROPIC):
            return Provider.ANTHROPIC, s.anthropic_translation_model

        if language in _CEREBRAS_LANGS and self._has(Provider.CEREBRAS):
            return Provider.CEREBRAS, s.cerebras_translation_model

        if language in _GROQ_LANGS and self._has(Provider.GROQ):
            return Provider.GROQ, s.groq_translation_model

        for prov, model in (
            (Provider.CEREBRAS, s.cerebras_translation_model),
            (Provider.GROQ, s.groq_translation_model),
            (Provider.ANTHROPIC, s.anthropic_translation_model),
        ):
            if self._has(prov):
                return prov, model

        raise RuntimeError("No LLM provider available for translation.")

    def _pick_generation(self) -> tuple[Provider, str]:
        s = get_settings()

        for prov, model in (
            (Provider.GROQ, s.groq_generation_model),
            (Provider.ANTHROPIC, s.anthropic_generation_model),
            (Provider.CEREBRAS, s.cerebras_translation_model),
        ):
            if self._has(prov):
                return prov, model

        raise RuntimeError("No LLM provider available for generation.")

    async def translate(
        self,
        system: str,
        prompt: str,
        language: str,
        max_tokens: int = 1500,
    ) -> str:
        provider, model = self._pick_translation(language)
        return await self._call(provider, model, system, prompt, max_tokens)

    async def generate(
        self,
        system: str,
        prompt: str,
        max_tokens: int = 1000,
    ) -> str:
        provider, model = self._pick_generation()
        return await self._call(provider, model, system, prompt, max_tokens)

    async def _call(
        self,
        provider: Provider,
        model: str,
        system: str,
        prompt: str,
        max_tokens: int,
    ) -> str:
        client = self._clients[provider]

        logger.info("llm.call", provider=provider.value, model=model)

        if provider == Provider.ANTHROPIC:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text
        else:
            response = await client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            )
            text = response.choices[0].message.content

        logger.info(
            "llm.done",
            provider=provider.value,
            model=model,
            chars=len(text) if text else 0,
        )
        return text or ""


_router: LLMRouter | None = None


def get_llm_router() -> LLMRouter:
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router
