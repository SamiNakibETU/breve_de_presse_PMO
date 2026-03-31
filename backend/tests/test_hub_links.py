"""Tests unitaires heuristiques liens hub (sans réseau)."""

from src.services.hub_links import extract_hub_article_links, _looks_like_article_url


def test_looks_like_article_opinion_path():
    hub = "https://www.example.com/opinion/"
    assert _looks_like_article_url(
        "https://www.example.com/opinion/world/2024/some-long-slug-here",
        hub,
    )


def test_rejects_tag_page():
    hub = "https://www.example.com/"
    assert not _looks_like_article_url("https://www.example.com/tag/politics/", hub)


def test_extract_from_html_anchor():
    html = """
    <html><body>
    <a href="/opinion/2024/01/15/a-very-long-editorial-title-here">X</a>
    <a href="/tag/foo">bad</a>
    </body></html>
    """
    links = extract_hub_article_links(
        html,
        "https://www.example.com/opinion/",
        max_links=10,
    )
    assert any("/opinion/2024/" in u for u in links)


def test_link_pattern_excludes_pagination_even_when_regex_matches_opinion():
    """Bugfix : le 2e passage pattern-only ne doit pas réintroduire /opinion/page/N."""
    html = """
    <html><body>
    <a href="https://www.example.com/opinion/page/2">p2</a>
    <a href="https://www.example.com/opinion/2024/03/20/real-slug-here">ok</a>
    </body></html>
    """
    links = extract_hub_article_links(
        html,
        "https://www.example.com/opinion/",
        max_links=10,
        link_pattern=r"/opinion/|/[0-9]{4}/",
        strict_link_pattern=False,
    )
    assert any("real-slug" in u for u in links)
    assert not any("/opinion/page/" in u for u in links)


def test_strict_link_pattern_sabah_excludes_column_hub_pages():
    """Pages /yazarlar/gunaydin (2 segments) vs /yazarlar/author/slug (3+)."""
    html = """
    <html><body>
    <a href="https://www.sabah.com.tr/yazarlar/gunaydin">col</a>
    <a href="https://www.sabah.com.tr/yazarlar/ali-veli/baslik-makalesi-123456">art</a>
    </body></html>
    """
    links = extract_hub_article_links(
        html,
        "https://www.sabah.com.tr/yazarlar",
        max_links=10,
        link_pattern=r"(?i)/yazarlar/[^/]+/[^/]+",
        strict_link_pattern=True,
    )
    assert any("123456" in u for u in links)
    assert not any(u.rstrip("/").endswith("gunaydin") for u in links)


def test_json_ld_itemlist():
    html = """
    <html><head>
    <script type="application/ld+json">
    {"@type":"ItemList","itemListElement":[
      {"@type":"ListItem","position":1,"url":"https://news.site/opinion/2023/story-one"},
      {"@type":"ListItem","position":2,"url":"https://news.site/tags/bad"}
    ]}
    </script>
    </head><body></body></html>
    """
    links = extract_hub_article_links(html, "https://news.site/opinion/", max_links=10)
    assert any("story-one" in u for u in links)
