"""
Normalisation du corps d’article (texte brut) pour stockage lisible.
"""

from __future__ import annotations

import re


# Lignes typiquement hors-corps (menus, réseaux sociaux)
_LINE_NOISE = re.compile(
    r"^(share|tweet|follow|subscribe|sign up|read more|related articles|"
    r"more stories|advertisement|publicité|تابعونا|شارك|اقرأ أيضا)\s*\.?\s*$",
    re.IGNORECASE,
)


def format_plain_article_text(raw: str | None) -> str:
    """
    - Retours ligne unifiés
    - Paragraphes séparés par une ligne vide
    - Espaces internes aux blocs resserrés
    """
    if not raw:
        return ""
    t = raw.replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"[ \t\f\v]+", " ", t)
    t = re.sub(r"\n[ \t]+\n", "\n\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)

    paragraphs: list[str] = []
    for block in t.split("\n\n"):
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue
        filtered: list[str] = []
        for ln in lines:
            if _LINE_NOISE.match(ln):
                continue
            filtered.append(ln)
        if not filtered:
            continue
        merged = " ".join(filtered)
        if len(merged) >= 2:
            paragraphs.append(merged)

    out = "\n\n".join(paragraphs).strip()
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out


def is_substantial_article_body(text: str, *, min_chars: int, min_words: int) -> bool:
    if not text or len(text.strip()) < min_chars:
        return False
    words = len(text.split())
    return words >= min_words


def is_acceptable_article_title(title: str | None, *, min_len: int = 6) -> bool:
    if not title:
        return False
    t = title.strip()
    if len(t) < min_len:
        return False
    low = t.lower()
    if low in ("untitled", "sans titre", "no title", "404", "error"):
        return False
    return True
