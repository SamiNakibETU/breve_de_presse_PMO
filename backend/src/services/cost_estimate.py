"""
Estimation tokens / coût USD pour le dashboard (pas de compteurs fournisseur côté router).

Les tarifs sont indicatifs ; à ajuster selon les grilles Anthropic / Groq / Cerebras en vigueur.
"""

from __future__ import annotations


def char_to_tokens_approx(text: str) -> int:
    """Heuristique ~4 caractères par token (latines)."""
    if not text:
        return 0
    return max(1, (len(text) + 3) // 4)


def _rates_usd_per_million_tokens(provider: str, model: str) -> tuple[float, float]:
    """(entrée, sortie) en USD pour 1M tokens."""
    p = (provider or "").lower().strip()
    m = (model or "").lower().strip()

    if p == "groq":
        return (0.05, 0.08)
    if p == "cerebras":
        return (0.10, 0.30)

    if "haiku" in m:
        return (1.0, 5.0)
    if "sonnet" in m:
        return (3.0, 15.0)
    if "opus" in m:
        return (15.0, 75.0)
    if p == "anthropic":
        return (3.0, 15.0)

    return (1.0, 5.0)


def estimate_cost_usd(
    *,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> float:
    rin, rout = _rates_usd_per_million_tokens(provider, model)
    return (max(0, input_tokens) * rin + max(0, output_tokens) * rout) / 1_000_000.0


def estimate_llm_usage(
    *,
    provider: str,
    model: str,
    input_text: str,
    output_text: str,
) -> tuple[int, int, float]:
    """Retourne (tokens entrée estimés, tokens sortie estimés, coût USD estimé)."""
    inp = char_to_tokens_approx(input_text)
    out = char_to_tokens_approx(output_text)
    cost = estimate_cost_usd(
        provider=provider,
        model=model,
        input_tokens=inp,
        output_tokens=out,
    )
    return inp, out, cost


def estimate_cohere_embed_usage(
    *,
    texts: list[str],
    vector_dim: int = 1024,
) -> tuple[int, int, float]:
    """
    Estimation pour batch d’embeddings Cohere.
    input_units ≈ tokens (heuristique caractères), output_units = dim × nb vecteurs (unités affichables).
    Tarif indicatif ~0,10 USD / 1M tokens entrée (ordre de grandeur ; à ajuster selon grille Cohere).
    """
    total_chars = sum(len(t or "") for t in texts)
    n = len(texts)
    if total_chars <= 0:
        inp = 1 if n else 0
    else:
        inp = max(1, (total_chars + 3) // 4)
    out = n * vector_dim
    cost = (max(0, inp) * 0.10) / 1_000_000.0
    return inp, out, cost
