"""
Nettoyage léger du texte article (extraction hub + affichage).

Règles alignées sur ``frontend/src/lib/editorial-body.ts`` (sanitizeTranslatedBodyForDisplay).
"""

from __future__ import annotations

import re

_NOISE_LINE_RES = (
    re.compile(r"0\s+commentaires?", re.I),
    re.compile(r"aucun\s+commentaire", re.I),
    re.compile(r"\d+\s+commentaires?", re.I),
)

_DATE_AFTER_DOT_RE = re.compile(
    r"\.(\s*)(?=\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b)",
    re.I,
)


def sanitize_extracted_plain_text(raw: str) -> str:
    """Retire lignes bruit commentaires ; insère saut avant date FR après un point."""
    if not raw or not raw.strip():
        return raw
    t0 = raw.replace("\r\n", "\n").strip()
    lines = t0.split("\n")
    kept: list[str] = []
    for line in lines:
        s = line.strip()
        if not s:
            kept.append(line)
            continue
        if any(p.fullmatch(s) for p in _NOISE_LINE_RES):
            continue
        kept.append(line)
    t = "\n".join(kept)
    t = _DATE_AFTER_DOT_RE.sub(r".\n\n\1", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()
