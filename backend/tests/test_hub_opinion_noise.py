"""Filtres bruit hubs opinion."""

from src.services.hub_opinion_noise import (
    is_noise_opinion_hub_url,
    should_reject_opinion_page,
)


def test_noise_times_topic() -> None:
    u = "https://blogs.timesofisrael.com/topic/ai-artificial-intelligence/"
    assert is_noise_opinion_hub_url(u) is True


def test_noise_al_ittihad_coverage_and_news() -> None:
    assert is_noise_opinion_hub_url("https://www.aletihad.ae/coverage/4301388/foo") is True
    assert is_noise_opinion_hub_url("https://www.aletihad.ae/news/foo/1/bar") is True


def test_noise_al_ittihad_opinion_kept() -> None:
    u = "https://www.aletihad.ae/opinion/4656612/foo"
    assert is_noise_opinion_hub_url(u) is False


def test_noise_gulf_op_eds_index() -> None:
    assert is_noise_opinion_hub_url("https://gulfnews.com/opinion/op-eds") is True
    assert is_noise_opinion_hub_url("https://gulfnews.com/opinion/op-eds/") is True


def test_noise_alanba_opinion_kept() -> None:
    u = "https://www.alanba.com.kw/ar/opinion/some-article-slug/"
    assert is_noise_opinion_hub_url(u) is False


def test_noise_alanba_section_shell() -> None:
    u = "https://www.alanba.com.kw/ar/kuwait-news/municipal-council/"
    assert is_noise_opinion_hub_url(u) is True


def test_reject_title_privacy() -> None:
    assert should_reject_opinion_page("https://example.com/x", "Privacy policy | Site") is True


def test_reject_real_opinion_ok() -> None:
    assert (
        should_reject_opinion_page(
            "https://www.thenationalnews.com/opinion/comment/2026/04/01/foo/",
            "Why post-crisis predictions are usually wrong",
        )
        is False
    )
