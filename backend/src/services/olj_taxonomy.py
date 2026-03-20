"""Taxonomie thématique OLJ (fichier JSON versionné)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "OLJ_TOPIC_TAXONOMY.json"
_TOPICS_DAY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "OLJ_TOPICS_OF_DAY.json"


@lru_cache
def _load_taxonomy_raw() -> dict[str, Any]:
    if not _DATA_PATH.exists():
        return {"version": "0", "topics": []}
    return json.loads(_DATA_PATH.read_text(encoding="utf-8"))


@lru_cache
def get_valid_topic_ids() -> frozenset[str]:
    data = _load_taxonomy_raw()
    topics = data.get("topics") or []
    return frozenset(str(t["id"]) for t in topics if isinstance(t, dict) and t.get("id"))


def clear_taxonomy_cache() -> None:
    _load_taxonomy_raw.cache_clear()
    get_valid_topic_ids.cache_clear()


def validate_olj_topic_ids(raw: Any, *, max_topics: int = 5) -> list[str]:
    """Ne garde que les IDs présents dans la taxonomie ; ordre préservé, sans doublons."""
    if not raw:
        return []
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    valid = get_valid_topic_ids()
    out: list[str] = []
    seen: set[str] = set()
    for x in raw:
        if not isinstance(x, str):
            continue
        tid = x.strip()
        if not tid or tid not in valid or tid in seen:
            continue
        seen.add(tid)
        out.append(tid)
        if len(out) >= max_topics:
            break
    return out


def taxonomy_prompt_block() -> str:
    """Bloc texte pour le prompt LLM (liste id + libellé)."""
    data = _load_taxonomy_raw()
    topics = data.get("topics") or []
    lines: list[str] = []
    for t in topics:
        if not isinstance(t, dict):
            continue
        tid = t.get("id")
        lab = t.get("label_fr") or tid
        if tid:
            desc = (t.get("description") or "").strip()
            if desc:
                lines.append(f'- "{tid}" : {lab} — {desc[:120]}')
            else:
                lines.append(f'- "{tid}" : {lab}')
    return "\n".join(lines) if lines else "(taxonomie vide — utiliser uniquement \"other\")"


def load_topics_of_day() -> list[str]:
    """IDs thématiques prioritaires du jour (bonus pertinence)."""
    if not _TOPICS_DAY_PATH.exists():
        return []
    try:
        data = json.loads(_TOPICS_DAY_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    raw = data.get("topic_ids") or []
    if not isinstance(raw, list):
        return []
    valid = get_valid_topic_ids()
    return [str(x).strip() for x in raw if isinstance(x, str) and str(x).strip() in valid]
