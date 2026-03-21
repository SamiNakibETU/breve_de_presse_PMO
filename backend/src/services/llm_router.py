"""
Hybrid LLM router: picks the cheapest capable provider per task and language.

Routing strategy:
  - Arabic/Persian/Turkish → Cerebras (Qwen3 235B, excellent multilingual)
  - Kurdish                 → Anthropic Haiku first (MEMW §2.2.2), then Cerebras/Groq
  - English/French          → Groq (Llama 4 Scout, fast & cheap)
  - Hebrew                  → Anthropic (Claude Haiku, only reliable option)
  - OLJ generation                → Anthropic Sonnet (priorité), puis Groq
  - Fallback                      → any available provider
  - 429 / quota                   → modèle Groq secondaire puis autres providers
"""

from __future__ import annotations

import time
from enum import Enum

import anthropic
import structlog
from openai import AsyncOpenAI, RateLimitError

from src.config import get_settings
from src.services import llm_cache
from src.services import metrics as app_metrics

logger = structlog.get_logger(__name__)


class Provider(str, Enum):
    GROQ = "groq"
    CEREBRAS = "cerebras"
    ANTHROPIC = "anthropic"


_CEREBRAS_LANGS = frozenset(("ar", "fa", "tr"))
_GROQ_LANGS = frozenset(("en", "fr"))


def _is_rate_limit(exc: BaseException) -> bool:
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, anthropic.RateLimitError):
        return True
    status = getattr(exc, "status_code", None)
    if status == 429:
        return True
    msg = str(exc).lower()
    return (
        "429" in msg
        or "rate_limit" in msg
        or "rate limit" in msg
        or "too many requests" in msg
    )


def _try_next_provider_after_error(exc: BaseException) -> bool:
    """
    Erreurs où le candidat suivant (autre modèle / fournisseur) peut réussir.
    Groq/Cerebras : NotFoundError = modèle inconnu ou retiré → ne pas bloquer toute la chaîne.
    """
    if _is_rate_limit(exc):
        return True
    mod = getattr(type(exc), "__module__", "") or ""
    name = type(exc).__name__
    if "openai" in mod:
        if name in (
            "NotFoundError",
            "APIConnectionError",
            "APITimeoutError",
            "InternalServerError",
        ):
            return True
        if name == "APIStatusError":
            sc = getattr(exc, "status_code", None)
            if sc in (404, 408, 429, 502, 503, 504):
                return True
    if "anthropic" in mod and name in ("InternalServerError", "APIStatusError"):
        sc = getattr(exc, "status_code", None)
        if sc in (429, 502, 503, 504):
            return True
    return False


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

        if language == "ku" and self._has(Provider.ANTHROPIC):
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

    def _translation_candidates(self, language: str) -> list[tuple[Provider, str]]:
        """Ordre de tentative : priorité langue, puis Groq fallback, puis file générale."""
        s = get_settings()
        ordered: list[tuple[Provider, str]] = []
        seen: set[tuple[Provider, str]] = set()

        def push(prov: Provider, model: str) -> None:
            if not self._has(prov) or not (model or "").strip():
                return
            pair = (prov, model.strip())
            if pair in seen:
                return
            seen.add(pair)
            ordered.append(pair)

        if language == "he":
            push(Provider.ANTHROPIC, s.anthropic_translation_model)
        if language == "ku":
            push(Provider.ANTHROPIC, s.anthropic_translation_model)
        if language in _CEREBRAS_LANGS:
            push(Provider.CEREBRAS, s.cerebras_translation_model)
        if language in _GROQ_LANGS:
            push(Provider.GROQ, s.groq_translation_model)
            fb = (s.groq_translation_model_fallback or "").strip()
            if fb and fb != s.groq_translation_model:
                push(Provider.GROQ, fb)

        push(Provider.CEREBRAS, s.cerebras_translation_model)
        push(Provider.GROQ, s.groq_translation_model)
        fb2 = (s.groq_translation_model_fallback or "").strip()
        if fb2 and fb2 != s.groq_translation_model:
            push(Provider.GROQ, fb2)
        push(Provider.ANTHROPIC, s.anthropic_translation_model)

        if not ordered:
            raise RuntimeError("No LLM provider available for translation.")
        return ordered

    def _pick_generation(self) -> tuple[Provider, str]:
        s = get_settings()

        for prov, model in (
            (Provider.ANTHROPIC, s.anthropic_generation_model),
            (Provider.GROQ, s.groq_generation_model),
            (Provider.CEREBRAS, s.cerebras_translation_model),
        ):
            if self._has(prov):
                return prov, model

        raise RuntimeError("No LLM provider available for generation.")

    def _generation_candidates(self) -> list[tuple[Provider, str]]:
        s = get_settings()
        ordered: list[tuple[Provider, str]] = []
        seen: set[tuple[Provider, str]] = set()

        def push(prov: Provider, model: str) -> None:
            if not self._has(prov) or not (model or "").strip():
                return
            pair = (prov, model.strip())
            if pair in seen:
                return
            seen.add(pair)
            ordered.append(pair)

        push(Provider.ANTHROPIC, s.anthropic_generation_model)
        push(Provider.GROQ, s.groq_generation_model)
        push(Provider.CEREBRAS, s.cerebras_translation_model)
        if not ordered:
            raise RuntimeError("No LLM provider available for generation.")
        return ordered

    async def translate(
        self,
        system: str,
        prompt: str,
        language: str,
        max_tokens: int = 1500,
    ) -> str:
        s = get_settings()
        use_json = bool(s.llm_use_json_object_mode)
        primary = self._pick_translation(language)
        cached = llm_cache.get_cached(system, prompt, primary[1])
        if cached is not None:
            logger.info("llm.cache_hit", model=primary[1])
            return cached

        candidates = self._translation_candidates(language)
        last_exc: BaseException | None = None
        for prov, model in candidates:
            t0 = time.perf_counter()
            try:
                text = await self._call(
                    prov,
                    model,
                    system,
                    prompt,
                    max_tokens,
                    json_object_mode=use_json,
                )
                dur = time.perf_counter() - t0
                app_metrics.record_llm_request(
                    provider=prov.value,
                    outcome="ok",
                    duration_seconds=dur,
                )
                llm_cache.set_cached(system, prompt, model, text)
                return text
            except Exception as exc:
                dur = time.perf_counter() - t0
                if _try_next_provider_after_error(exc):
                    app_metrics.record_llm_request(
                        provider=prov.value,
                        outcome="rate_limited"
                        if _is_rate_limit(exc)
                        else "error",
                        duration_seconds=dur,
                    )
                    if _is_rate_limit(exc):
                        logger.warning(
                            "llm.translate_rate_limited",
                            provider=prov.value,
                            model=model,
                            error=str(exc)[:200],
                        )
                    else:
                        logger.warning(
                            "llm.translate_try_next_provider",
                            provider=prov.value,
                            model=model,
                            error=str(exc)[:200],
                        )
                    last_exc = exc
                    continue
                app_metrics.record_llm_request(
                    provider=prov.value,
                    outcome="error",
                    duration_seconds=dur,
                )
                raise
        if last_exc:
            raise last_exc
        raise RuntimeError("No translation candidate succeeded")

    async def generate(
        self,
        system: str,
        prompt: str,
        max_tokens: int = 1000,
    ) -> str:
        candidates = self._generation_candidates()
        last_exc: BaseException | None = None
        for prov, model in candidates:
            t0 = time.perf_counter()
            try:
                text = await self._call(
                    prov,
                    model,
                    system,
                    prompt,
                    max_tokens,
                    json_object_mode=False,
                )
                dur = time.perf_counter() - t0
                app_metrics.record_llm_request(
                    provider=prov.value,
                    outcome="ok",
                    duration_seconds=dur,
                )
                return text
            except Exception as exc:
                dur = time.perf_counter() - t0
                if _try_next_provider_after_error(exc):
                    app_metrics.record_llm_request(
                        provider=prov.value,
                        outcome="rate_limited"
                        if _is_rate_limit(exc)
                        else "error",
                        duration_seconds=dur,
                    )
                    if _is_rate_limit(exc):
                        logger.warning(
                            "llm.generate_rate_limited",
                            provider=prov.value,
                            model=model,
                            error=str(exc)[:200],
                        )
                    else:
                        logger.warning(
                            "llm.generate_try_next_provider",
                            provider=prov.value,
                            model=model,
                            error=str(exc)[:200],
                        )
                    last_exc = exc
                    continue
                app_metrics.record_llm_request(
                    provider=prov.value,
                    outcome="error",
                    duration_seconds=dur,
                )
                raise
        if last_exc:
            raise last_exc
        raise RuntimeError("No generation candidate succeeded")

    async def small_json_classify(self, system: str, user: str, max_tokens: int = 256) -> str:
        """
        Appel court pour classif JSON (gate ingestion, heuristiques).
        Préfère Anthropic (Haiku), puis Groq avec json_object.
        """
        s = get_settings()
        last_exc: BaseException | None = None
        prompt = (
            f"{user}\n\nRéponds uniquement par un objet JSON, sans markdown ni texte autour."
        )
        if self._has(Provider.ANTHROPIC):
            try:
                return await self._call(
                    Provider.ANTHROPIC,
                    s.anthropic_translation_model,
                    system,
                    prompt,
                    max_tokens,
                    json_object_mode=False,
                )
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "llm.small_json_classify_anthropic_failed",
                    error=str(exc)[:200],
                )
        if self._has(Provider.GROQ):
            model = (s.groq_translation_model_fallback or s.groq_translation_model).strip()
            return await self._call(
                Provider.GROQ,
                model,
                system,
                prompt,
                max_tokens,
                json_object_mode=bool(s.llm_use_json_object_mode),
            )
        if last_exc:
            raise last_exc
        raise RuntimeError("No LLM provider available for small_json_classify")

    async def completion_plain(
        self,
        system: str,
        user: str,
        max_tokens: int = 900,
    ) -> str:
        """Texte libre (pas de JSON forcé) — passes Chain of Density, etc."""
        s = get_settings()
        last_exc: BaseException | None = None
        candidates: list[tuple[Provider, str]] = []
        if self._has(Provider.ANTHROPIC):
            candidates.append((Provider.ANTHROPIC, s.anthropic_translation_model))
        if self._has(Provider.GROQ):
            candidates.append((Provider.GROQ, s.groq_translation_model))
            fb = (s.groq_translation_model_fallback or "").strip()
            if fb and fb != s.groq_translation_model:
                candidates.append((Provider.GROQ, fb))
        for prov, model in candidates:
            try:
                return await self._call(
                    prov,
                    model,
                    system,
                    user,
                    max_tokens,
                    json_object_mode=False,
                )
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "llm.completion_plain_failed",
                    provider=prov.value,
                    error=str(exc)[:160],
                )
        if last_exc:
            raise last_exc
        raise RuntimeError("No LLM provider available for completion_plain")

    async def generate_anthropic_only(
        self,
        system: str,
        prompt: str,
        max_tokens: int = 1200,
    ) -> str:
        """Génération revue : option stricte Sonnet uniquement (MEMW §2.4.3)."""
        s = get_settings()
        if not self._has(Provider.ANTHROPIC):
            raise RuntimeError(
                "Anthropic requis (OLJ_GENERATION_ANTHROPIC_ONLY) mais clé absente.",
            )
        return await self._call(
            Provider.ANTHROPIC,
            s.anthropic_generation_model,
            system,
            prompt,
            max_tokens,
            json_object_mode=False,
        )

    async def generate_groq_only(
        self,
        system: str,
        prompt: str,
        max_tokens: int = 1200,
    ) -> str:
        """Second appel : résumé bloc via Groq (variante coût MEMW §2.4.3)."""
        s = get_settings()
        if not self._has(Provider.GROQ):
            raise RuntimeError("Groq requis pour la variante thèse Sonnet / résumé Groq.")
        return await self._call(
            Provider.GROQ,
            s.groq_generation_model,
            system,
            prompt,
            max_tokens,
            json_object_mode=False,
        )

    async def _call(
        self,
        provider: Provider,
        model: str,
        system: str,
        prompt: str,
        max_tokens: int,
        *,
        json_object_mode: bool = False,
    ) -> str:
        client = self._clients[provider]

        logger.info(
            "llm.call",
            provider=provider.value,
            model=model,
            json_object_mode=json_object_mode,
        )

        if provider == Provider.ANTHROPIC:
            s = get_settings()
            sys_param: object = system
            if (
                getattr(s, "anthropic_use_prompt_cache", False)
                and system
                and not json_object_mode
            ):
                sys_param = [
                    {
                        "type": "text",
                        "text": system,
                        "cache_control": {"type": "ephemeral"},
                    },
                ]
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=sys_param,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text
        else:
            kwargs: dict = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            }
            if json_object_mode:
                kwargs["response_format"] = {"type": "json_object"}
            try:
                response = await client.chat.completions.create(**kwargs)
            except Exception as exc:
                if json_object_mode and "response_format" in kwargs:
                    del kwargs["response_format"]
                    logger.warning(
                        "llm.json_object_rejected",
                        provider=provider.value,
                        error=str(exc)[:200],
                    )
                    response = await client.chat.completions.create(**kwargs)
                else:
                    raise
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
