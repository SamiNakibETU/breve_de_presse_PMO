"""Glossaire OLJ injecté dans les prompts (léger, par thématiques)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "OLJ_GLOSSARY.json"


@lru_cache
def _load_glossary_raw() -> dict[str, Any]:
    if not _DATA_PATH.exists():
        return {"version": "0", "entries": []}
    return json.loads(_DATA_PATH.read_text(encoding="utf-8"))


def clear_glossary_cache() -> None:
    _load_glossary_raw.cache_clear()


def glossary_prompt_block_for_topics(olj_topic_ids: list[str] | None, *, max_entries: int = 12) -> str:
    """Sélectionne les entrées dont topic_ids intersecte olj_topic_ids (ou toutes si pas de topics)."""
    data = _load_glossary_raw()
    entries = data.get("entries") or []
    if not isinstance(entries, list):
        return ""

    want = set(olj_topic_ids or [])
    picked: list[dict[str, Any]] = []
    for e in entries:
        if not isinstance(e, dict):
            continue
        et = e.get("topic_ids") or []
        if not isinstance(et, list):
            et = []
        et_set = {str(x) for x in et if isinstance(x, str)}
        if want and not (et_set & want):
            continue
        picked.append(e)
        if len(picked) >= max_entries:
            break

    if not picked and not want:
        for e in entries:
            if isinstance(e, dict):
                picked.append(e)
            if len(picked) >= max_entries:
                break

    lines: list[str] = []
    for e in picked:
        terms = []
        for k in ("term_ar", "term_en", "term_fr"):
            v = e.get(k)
            if isinstance(v, str) and v.strip():
                terms.append(f"{k.split('_')[1]}:{v.strip()}")
        if not terms:
            continue
        tr = e.get("term_fr") or e.get("term_en") or e.get("term_ar") or ""
        ctx = (e.get("context_fr") or "").strip()
        lines.append("- " + ", ".join(terms) + (f" → {tr}" if tr else "") + (f". {ctx}" if ctx else ""))

    if not lines:
        return ""
    return "GLOSSAIRE OLJ (respecter ces équivalences / nuances) :\n" + "\n".join(lines)
