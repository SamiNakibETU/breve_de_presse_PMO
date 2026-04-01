"""Découverte de liens enrichie — heuristiques alignées sur ``scraper/retenu_final`` (filtre bruit)."""

from __future__ import annotations

from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

_JUNK_SUBSTR = (
    "/login",
    "/signin",
    "/subscribe",
    "/video",
    "/gallery",
    "/tag/",
    "/author/",
    "/writers/",
    "/writer/",
    "/search",
    "/account",
    ".jpg",
    ".png",
    ".pdf",
    "/cdn-cgi/",
    "/newsletter",
    "/podcast",
    "/facebook",
    "/twitter",
    "utm_",
)


def discover_article_links_from_html(html: str, base_url: str) -> list[str]:
    """
    Extraction légère de liens candidats (même domaine que le hub, exclusion bruit type
    ``smart_content.filter_article_urls`` dans ``scraper/retenu_final``).
    Réservé aux tests / comparaisons ; la collecte production reste sur les flux configurés.
    """
    if not html.strip():
        return []
    hub_p = urlparse(base_url)
    hub_host = hub_p.netloc.lower()
    hub_path = hub_p.path.rstrip("/") or ""
    soup = BeautifulSoup(html, "html.parser")
    out: list[str] = []
    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#") or href.startswith("javascript:"):
            continue
        abs_url = urljoin(base_url, href).split("#", 1)[0]
        p = urlparse(abs_url)
        if p.netloc.lower() != hub_host:
            continue
        low = p.path.lower()
        if any(j in low for j in _JUNK_SUBSTR):
            continue
        if p.path.rstrip("/") == hub_path.rstrip("/"):
            continue
        if abs_url.startswith("http"):
            out.append(abs_url)
    seen: set[str] = set()
    uniq: list[str] = []
    for u in out:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    return uniq
