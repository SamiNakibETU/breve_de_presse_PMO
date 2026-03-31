"""
Complétions LLM pour étapes pipeline / rédaction MEMW alignées sur le flag
`olj_generation_anthropic_only` : chaîne multi-fournisseurs (`generate`) ou Sonnet strict.
"""

from __future__ import annotations

from src.config import get_settings
from src.services.llm_router import LLMRouter


async def olj_pipeline_completion(
    router: LLMRouter,
    system: str,
    user: str,
    *,
    max_tokens: int,
    temperature: float | None = None,
    model: str | None = None,
) -> str:
    s = get_settings()
    if s.olj_generation_anthropic_only:
        return await router.generate_anthropic_only(
            system,
            user,
            max_tokens=max_tokens,
            temperature=temperature,
            model=model,
        )
    return await router.generate(system, user, max_tokens=max_tokens)
