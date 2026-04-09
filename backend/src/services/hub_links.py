"""
Extraction de liens « article » depuis une page hub (HTML).

Combine ancres <a>, JSON-LD ItemList, et heuristiques de chemin par langue / CMS.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Iterable
from urllib.parse import urljoin, urlparse, unquote

import structlog
from bs4 import BeautifulSoup

from src.services.hub_opinion_noise import is_noise_opinion_hub_url
from src.services.smart_content import filter_article_urls

logger = structlog.get_logger(__name__)

SKIP_PATH_FRAGMENTS = (
    "/tag/",
    "/tags/",
    "/topics/",
    "/twitter",
    "/facebook",
    "/whatsapp",
    "/category/",
    # Ne pas mettre "/author/" ici : la sous-chaîne matcherait aussi "/authors/" (ex. Al-Watan BH).
    "/page/",
    # Listes de chroniqueurs (ex. akhbarelyom.com/Editors/EditorNews/…), pas un article.
    "/editors/editornews",
    # Pages de rubrique type « section / id / slug », pas un article (akhbarelyom.com).
    "/news/newssection/",
    "/search",
    "/login",
    "/register",
    "/subscribe",
    "/video",
    "/videos",
    "/gallery",
    "/rss",
    "/feed",
    ".pdf",
    ".jpg",
    ".png",
    "/wp-json",
    "/cookie",
    "/privacy",
    "/newadv/",
)

# Segments typiques d’URL d’article (multilingue)
ARTICLE_PATH_HINTS = (
    "/article/",
    "/articles/",
    "/story/",
    "/stories/",
    "/news/",
    "/node/",
    "/post/",
    "/posts/",
    "/detail/",
    "/opinion/",
    "/editorial/",
    "/column/",
    "/columns/",
    "/yazarlar/",
    "/yazar/",
    "/kose-yazilari/",
    "/opinions/",
    "/comment/",
    "/analysis/",
    "/blogs/",
    "/blog/",
    "/views/",
    "/مقالات/",
    "/رأي/",
    "/آراء/",
    "/كت/",
    "/authors/",
)


def _path_has_excluded_fragment(low_url: str) -> bool:
    """Fragments à exclure ; /author/ seul (bio) sans bloquer /authors/ (listes d’opinion)."""
    if any(s in low_url for s in SKIP_PATH_FRAGMENTS):
        return True
    if "/authors/" in low_url:
        return False
    if "/author/" in low_url:
        return True
    return False


def _host_key(netloc: str) -> str:
    n = (netloc or "").lower()
    if n.startswith("www."):
        n = n[4:]
    return n


def _hosts_compatible(article_netloc: str, hub_netloc: str) -> bool:
    a, h = _host_key(article_netloc), _host_key(hub_netloc)
    if a == h:
        return True
    return a.endswith("." + h) or h.endswith("." + a)


def _path_matches_regex(path: str, pattern_re: re.Pattern) -> bool:
    try:
        return bool(pattern_re.search(path))
    except re.error:
        return False


def _relaxed_article_candidate(full_url: str, hub_url: str) -> bool:
    """Même site, slug profond ou date / id — pour CMS qui n’utilisent pas les motifs classiques."""
    hub_p = urlparse(hub_url)
    p = urlparse(full_url)
    if p.scheme not in ("http", "https") or not p.netloc:
        return False
    if not _hosts_compatible(p.netloc, hub_p.netloc):
        return False
    raw_path = p.path or ""
    if raw_path.rstrip("/") == (hub_p.path or "").rstrip("/"):
        return False
    path_decoded = unquote(raw_path).lower()
    low = full_url.lower()
    if _path_has_excluded_fragment(low):
        return False
    hard_skip = (
        "/topic/",
        "/topics/",
        "/page/",
        "/search",
        "/login",
        "/register",
        "/subscribe",
        "/video",
        "/videos/",
        "/gallery",
        ".pdf",
        ".jpg",
        ".png",
        "/wp-json",
        "/feed",
        "/rss",
        "/sitemap",
        "/twitter",
        "/facebook",
        "/whatsapp",
        "/cookie",
        "/privacy",
        "/newadv/",
    )
    for s in hard_skip:
        if s in low:
            return False
    parts = [x for x in raw_path.split("/") if x]
    if not parts:
        return False
    last = parts[-1].lower()
    if last in ("feed", "rss", "atom", "sitemap.xml"):
        return False
    if re.search(r"/\d{4}/\d{2}/", path_decoded) or re.search(r"/\d{4}/", path_decoded):
        return True
    if re.search(r"\d{6,}", path_decoded):
        return True
    if len(parts) >= 3:
        return True
    if len(parts) == 2 and len(last) >= 14:
        return True
    if len(parts) == 1 and len(last) >= 28:
        return True
    return False


def _article_url_with_pattern(full_url: str, hub_url: str, pattern_re: re.Pattern) -> bool:
    p = urlparse(full_url)
    if p.scheme not in ("http", "https") or not p.netloc:
        return False
    if not _hosts_compatible(p.netloc, urlparse(hub_url).netloc):
        return False
    path = p.path or ""
    if not _path_matches_regex(path, pattern_re):
        return False
    low = full_url.lower()
    # Même avec link_pattern : exclure pagination, tags, etc. (ex. /opinion/page/2).
    if _path_has_excluded_fragment(low):
        return False
    if any(x in low for x in (".pdf", ".jpg", "/feed", "/rss", "/wp-json")):
        return False
    return True


def _looks_like_article_url(full_url: str, hub_url: str) -> bool:
    hub_p = urlparse(hub_url)
    p = urlparse(full_url)
    if p.scheme not in ("http", "https") or not p.netloc:
        return False
    if not _hosts_compatible(p.netloc, hub_p.netloc):
        return False
    path = (p.path or "").lower()
    low = full_url.lower()
    if _path_has_excluded_fragment(low):
        return False
    if len(path) < 4:
        return False

    if re.search(r"/\d{4}/\d{2}/", path) or re.search(r"/\d{4}/", path):
        return True
    if re.search(r"/\d{6,}", path):
        return True
    if re.search(r"/article/\d{4,}", path, re.I):
        return True
    if "/authors/" in path:
        segs = [x for x in path.split("/") if x]
        if len(segs) >= 3 and segs[0] == "authors" and segs[1].isdigit():
            return True
    if any(h in path for h in ARTICLE_PATH_HINTS):
        tail = path.split("/")[-1]
        if len(tail) >= 8:
            return True
    if path.count("/") >= 3 and len(path) >= 32:
        return True
    return False


def _iter_json_ld_urls(obj: object) -> Iterable[str]:
    if isinstance(obj, dict):
        t = obj.get("@type")
        if isinstance(t, list):
            types = {str(x).lower() for x in t}
        else:
            types = {str(t).lower()} if t else set()
        if "itemlist" in types or t == "ItemList":
            items = obj.get("itemListElement") or []
            for it in items:
                if isinstance(it, dict):
                    u = it.get("url") or (it.get("item") or {}).get("@id")
                    if isinstance(u, str) and u.startswith("http"):
                        yield u
        for v in obj.values():
            yield from _iter_json_ld_urls(v)
    elif isinstance(obj, list):
        for x in obj:
            yield from _iter_json_ld_urls(x)


def _links_from_json_ld(
    html: str,
    hub_url: str,
    *,
    url_ok: Callable[[str, str], bool] | None = None,
) -> list[str]:
    pred = url_ok or _looks_like_article_url
    out: list[str] = []
    soup = BeautifulSoup(html, "html.parser")
    for script in soup.find_all("script", attrs={"type": lambda x: x and "ld+json" in x.lower()}):
        raw = script.string or script.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for u in _iter_json_ld_urls(data):
            full = urljoin(hub_url, u)
            if pred(full, hub_url):
                out.append(full)
    return out


def extract_hub_article_links(
    html: str,
    hub_url: str,
    max_links: int,
    *,
    link_pattern: str | None = None,
    link_selector: str | None = None,
    relaxed_same_site: bool = False,
    strict_link_pattern: bool = False,
) -> list[str]:
    """
    Extrait des URLs d’articles depuis un hub.

    Options (registre overrides) :
    - link_pattern : regex sur le chemin (ex. r"/node/\\d+")
    - link_selector : sélecteur CSS BeautifulSoup pour des <a>
    - relaxed_same_site : heuristique large même domaine
    - strict_link_pattern : si True et link_pattern défini, n’accepte que les URLs
      qui matchent la regex (ex. Sabah : exclure /yazarlar/gunaydin).
    """
    seen: set[str] = set()
    ordered: list[str] = []

    pattern_re: re.Pattern | None = None
    if link_pattern:
        try:
            pattern_re = re.compile(link_pattern, re.IGNORECASE)
        except re.error:
            pattern_re = None

    def _accept_standard(u: str) -> bool:
        if strict_link_pattern and pattern_re:
            return _article_url_with_pattern(u, hub_url, pattern_re)
        if pattern_re:
            return _looks_like_article_url(u, hub_url) or _article_url_with_pattern(
                u, hub_url, pattern_re
            )
        return _looks_like_article_url(u, hub_url)

    def add_url(u: str, predicate) -> None:
        nonlocal ordered
        if u in seen or len(ordered) >= max_links:
            return
        if not predicate(u):
            return
        seen.add(u)
        ordered.append(u)

    def _finalize_links() -> list[str]:
        sans_bruit = [u for u in ordered if not is_noise_opinion_hub_url(u)]
        refined = filter_article_urls(hub_url, sans_bruit, max_urls=max_links)
        if refined:
            return refined[:max_links]
        return sans_bruit[:max_links]

    def _pred_json(full: str, _h: str) -> bool:
        return _accept_standard(full)

    for u in _links_from_json_ld(html, hub_url, url_ok=_pred_json):
        if u not in seen:
            seen.add(u)
            ordered.append(u)
        if len(ordered) >= max_links:
            return _finalize_links()

    soup = BeautifulSoup(html, "html.parser")

    if link_selector:
        try:
            for a in soup.select(link_selector):
                href = (a.get("href") or "").strip()
                if not href or href.startswith("#"):
                    continue
                full = urljoin(hub_url, href)
                add_url(full, _accept_standard)
                if len(ordered) >= max_links:
                    return _finalize_links()
        except Exception as exc:
            logger.debug(
                "hub_links.link_selector_failed",
                hub_url=hub_url[:80],
                selector=link_selector,
                error=str(exc)[:120],
            )

    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#"):
            continue
        full = urljoin(hub_url, href)
        add_url(full, _accept_standard)
        if len(ordered) >= max_links:
            return _finalize_links()

    if pattern_re:
        for a in soup.find_all("a", href=True):
            href = (a.get("href") or "").strip()
            if not href or href.startswith("#"):
                continue
            full = urljoin(hub_url, href)
            add_url(full, lambda u: _article_url_with_pattern(u, hub_url, pattern_re))
            if len(ordered) >= max_links:
                return _finalize_links()

    if relaxed_same_site:
        for a in soup.find_all("a", href=True):
            href = (a.get("href") or "").strip()
            if not href or href.startswith("#"):
                continue
            full = urljoin(hub_url, href)
            add_url(full, lambda u: _relaxed_article_candidate(u, hub_url))
            if len(ordered) >= max_links:
                return _finalize_links()

    return _finalize_links()
