"""
Extraction du texte principal et filtrage des liens « article » depuis un hub.

- ``extract_main_text`` : Trafilatura en premier (qualite article), puis BS4 si peu de texte.
- ``is_cloudflare_challenge`` : detecte les pages challenge Cloudflare.
- ``filter_article_urls`` : garde les URLs du meme domaine, exclut bruit (login, pdf,
  caricatures, writer index Israel Hayom, etc.), regles specifiques Haaretz / Israel Hayom,
  regle generique (profondeur de chemin ou segment /20xx/).

A ajuster ici si un nouveau media du registre a des patterns d'URL particuliers.
"""
from __future__ import annotations

import re
from typing import Optional, Tuple
from urllib.parse import urlparse, urljoin


def extract_main_text(html: str, url: str) -> Tuple[Optional[str], Optional[str], int]:
    """
    Retourne (texte_principal, titre, nb_mots).
    Trafilatura est optimise pour le corps d'article ; le repli agrege les paragraphes.
    """
    text: Optional[str] = None
    title: Optional[str] = None

    try:
        import trafilatura
        from trafilatura import metadata as tf_meta

        text = trafilatura.extract(
            html,
            url=url,
            include_comments=False,
            include_tables=True,
            favor_precision=True,
        )
        meta = tf_meta.extract_metadata(html, default_url=url)
        if meta and getattr(meta, "title", None):
            title = meta.title
    except Exception:
        text = None

    if not text or len(text.split()) < 80:
        text, title = _fallback_bs4(html, title)

    words = len(text.split()) if text else 0
    return text, title, words


def _fallback_bs4(html: str, title: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    if not title and soup.title and soup.title.string:
        title = soup.title.string.strip()

    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
        tag.decompose()

    for selector in (
        "article",
        "[role='main']",
        "main",
        "[class*='article-body']",
        "[class*='articleBody']",
        "[data-test='articleBody']",
        ".entry-content",
        ".post-content",
    ):
        node = soup.select_one(selector)
        if node:
            t = node.get_text(separator=" ", strip=True)
            if len(t.split()) >= 80:
                return t, title

    body = soup.find("body")
    if body:
        return body.get_text(separator=" ", strip=True), title
    return soup.get_text(separator=" ", strip=True), title


def is_cloudflare_challenge(html: str) -> bool:
    h = html.lower()
    return (
        "just a moment" in h
        or "challenges.cloudflare.com" in h
        or "cf-challenge" in h
        or "turnstile" in h and "cloudflare" in h
    )


def filter_article_urls(hub_url: str, hrefs: list[str], max_urls: int = 12) -> list[str]:
    """
    Filtre les liens candidats pour pages article depuis un hub opinion / home.
    """
    hub_p = urlparse(hub_url)
    hub_path = hub_p.path.rstrip("/") or ""
    host_l = hub_p.netloc.lower()
    max_eff = max(max_urls * 4, 40) if "israelhayom.com" in host_l else max_urls

    seen: set[str] = set()
    out: list[str] = []

    for raw in hrefs:
        if not raw or raw.startswith("javascript:"):
            continue
        try:
            full = urljoin(hub_url, raw)
        except Exception:
            continue
        p = urlparse(full)
        if p.netloc != hub_p.netloc:
            continue
        path = p.path
        low = path.lower()
        junk = (
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
            "/caricatures/",
            "/cartoon",
            "getintouch",
            "/pages/",
            "/pdf",
            "/newsletter",
            "/promo",
            "/promotions/",
            "/live/",
            "/podcast",
            "/weather/",
            "/horoscope",
            "/games/",
            "/shop/",
            "/facebook",
            "/twitter",
            "utm_",
        )
        if any(x in low for x in junk):
            continue

        # Ne pas reprendre le hub exact
        if path.rstrip("/") == hub_path.rstrip("/") or path.rstrip("/") + "/" == hub_path.rstrip("/") + "/":
            continue

        host = hub_p.netloc.lower()

        if "haaretz.com" in host:
            if "/opinion/" in low and ("ty-article" in low or re.search(r"/opinion/[^/]+/\d{4}-\d{2}-\d{2}/", low)):
                key = full.split("?")[0]
                if key not in seen:
                    seen.add(key)
                    out.append(full)
        elif "israelhayom.com" in host:
            if "/writer/" in low:
                continue
            parts = [x for x in path.split("/") if x]
            pl = [p.lower() for p in parts]
            opinion_idx = None
            for name in ("opinions", "opinion"):
                if name in pl:
                    opinion_idx = pl.index(name)
                    break
            is_opinion_article = (
                opinion_idx is not None and len(parts) > opinion_idx + 1 and len(path) > 16
            )
            slug_id = re.search(r"-\d{5,}(?:/|$|\?)", path) is not None
            numeric_folder = re.search(r"/\d{6,}(?:/|$)", path) is not None
            category_deep = "/category/" in low and low.count("/") >= 4 and slug_id
            if (
                is_opinion_article
                or "/article/" in low
                or slug_id
                or category_deep
                or (numeric_folder and "/caricatures/" not in low)
            ):
                key = full.split("?")[0]
                if key not in seen:
                    seen.add(key)
                    out.append(full)
        else:
            # Hub generique : plus profond que le hub, ou segment date /20xx/
            depth_hub = max(0, hub_path.count("/"))
            depth = path.count("/")
            path_norm = path.rstrip("/")
            hub_norm = hub_path.rstrip("/")
            deeper = depth >= depth_hub + 1 and len(path_norm) > len(hub_norm) + 3
            dated = re.search(r"/20[12]\d{2}/", path) is not None
            if (deeper or dated) and path_norm != hub_norm:
                key = full.split("?")[0]
                if key not in seen:
                    seen.add(key)
                    out.append(full)

        if len(out) >= max_eff:
            break

    if "israelhayom.com" in host_l:
        op = [u for u in out if "/opinions/" in u.lower() or "/opinion/" in u.lower()]
        rest = [u for u in out if u not in op]
        out = (op + rest)[:max_urls]

    return out
