"""Extraction articleBody depuis JSON-LD."""

from src.services.hub_article_jsonld import (
    extract_best_article_body_from_jsonld,
    merge_longest_body_with_jsonld,
)


def test_extract_article_body_from_news_article_ld() -> None:
    html = """
    <html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"NewsArticle","headline":"Titre",
     "articleBody":"Premier paragraphe du corps.\\n\\nDeuxième paragraphe plus long pour le test."}
    </script></head><body></body></html>
    """
    out = extract_best_article_body_from_jsonld(html)
    assert "Premier paragraphe" in out
    assert "Deuxième paragraphe" in out


def test_merge_prefers_longer_jsonld() -> None:
    html = """
    <script type="application/ld+json">
    {"@type":"Article","articleBody":"%s"}
    </script>
    """ % ("mot " * 400)
    merged = merge_longest_body_with_jsonld(html, "court")
    assert len(merged) > len("court")


def test_merge_keeps_body_when_jsonld_short() -> None:
    html = """<script type="application/ld+json">{"articleBody":"hi"}</script>"""
    merged = merge_longest_body_with_jsonld(html, "un texte beaucoup plus long " * 10)
    assert "beaucoup plus long" in merged
