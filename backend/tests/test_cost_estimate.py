from src.services.cost_estimate import (
    char_to_tokens_approx,
    estimate_cohere_embed_usage,
    estimate_cost_usd,
    estimate_llm_usage,
)


def test_char_to_tokens_approx_empty() -> None:
    assert char_to_tokens_approx("") == 0


def test_char_to_tokens_approx_rounding() -> None:
    assert char_to_tokens_approx("abcd") == 1
    assert char_to_tokens_approx("abcde") == 2


def test_estimate_cost_usd_positive() -> None:
    c = estimate_cost_usd(
        provider="anthropic",
        model="claude-sonnet-4-5-20241022",
        input_tokens=1_000_000,
        output_tokens=0,
    )
    assert c > 0


def test_estimate_cohere_embed_positive() -> None:
    inp, out, cost = estimate_cohere_embed_usage(texts=["hello " * 100, "world"], vector_dim=1024)
    assert inp >= 1
    assert out == 2 * 1024
    assert cost >= 0


def test_estimate_llm_usage_groq_cheaper_than_sonnet() -> None:
    _, _, sonnet = estimate_llm_usage(
        provider="anthropic",
        model="claude-sonnet-4-5-20241022",
        input_text="x" * 4000,
        output_text="y" * 1000,
    )
    _, _, groq = estimate_llm_usage(
        provider="groq",
        model="llama",
        input_text="x" * 4000,
        output_text="y" * 1000,
    )
    assert groq < sonnet
