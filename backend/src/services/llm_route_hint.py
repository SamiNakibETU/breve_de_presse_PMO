"""
Indicatif fournisseur / modèle aligné sur la logique de `llm_router` (sans l’importer).

À tenir cohérent avec `LLMRouter._pick_translation`, `completion_plain`, `small_json_classify`.
Utilisé uniquement pour le ledger coûts (estimation) lorsque le routeur ne renvoie pas le couple exact.
"""

from __future__ import annotations

from src.config import get_settings

_CEREBRAS_LANGS = frozenset(("ar", "fa", "tr"))
_GROQ_LANGS = frozenset(("en", "fr"))


def _has_anthropic() -> bool:
    return bool(get_settings().anthropic_api_key)


def _has_groq() -> bool:
    return bool(get_settings().groq_api_key)


def _has_cerebras() -> bool:
    return bool(get_settings().cerebras_api_key)


def hint_translation_primary(language: str) -> tuple[str, str]:
    """Premier fournisseur utilisé par `translate()` pour cette langue (ordre router)."""
    s = get_settings()
    lang = (language or "en").lower().strip()

    if lang == "he" and _has_anthropic():
        return "anthropic", s.anthropic_translation_model
    if lang == "ku" and _has_anthropic():
        return "anthropic", s.anthropic_translation_model
    if lang in _CEREBRAS_LANGS and _has_cerebras():
        return "cerebras", s.cerebras_translation_model
    if lang in _GROQ_LANGS and _has_groq():
        return "groq", s.groq_translation_model

    for prov, model in (
        ("cerebras", s.cerebras_translation_model),
        ("groq", s.groq_translation_model),
        ("anthropic", s.anthropic_translation_model),
    ):
        if prov == "cerebras" and _has_cerebras() and (model or "").strip():
            return prov, model.strip()
        if prov == "groq" and _has_groq() and (model or "").strip():
            return prov, model.strip()
        if prov == "anthropic" and _has_anthropic() and (model or "").strip():
            return prov, model.strip()

    return "unknown", "unknown"


def hint_completion_plain_primary() -> tuple[str, str]:
    """Premier candidat de `completion_plain`."""
    s = get_settings()
    if _has_anthropic():
        return "anthropic", s.anthropic_translation_model
    if _has_groq():
        return "groq", s.groq_translation_model
    return "unknown", "unknown"


def hint_small_json_classify_primary() -> tuple[str, str]:
    """Ordre `small_json_classify` : Anthropic puis Groq."""
    s = get_settings()
    if _has_anthropic():
        return "anthropic", s.anthropic_translation_model
    if _has_groq():
        m = (s.groq_translation_model_fallback or s.groq_translation_model).strip()
        return "groq", m or s.groq_translation_model
    return "unknown", "unknown"


def hint_anthropic_generation() -> tuple[str, str]:
    s = get_settings()
    return "anthropic", (s.anthropic_generation_model or "claude").strip()
