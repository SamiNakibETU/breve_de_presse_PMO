"""Regroupement des `media_source_id` dupliqués (même média, plusieurs fiches en base)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
_ALIAS_FILE = _BACKEND_ROOT / "data" / "MEDIA_SOURCE_ALIAS_GROUPS.json"


@lru_cache(maxsize=1)
def _id_to_sorted_group() -> dict[str, tuple[str, ...]]:
    raw: dict = {}
    try:
        with open(_ALIAS_FILE, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    groups = raw.get("groups") or []
    out: dict[str, tuple[str, ...]] = {}
    for g in groups:
        if not isinstance(g, list):
            continue
        ids = tuple(sorted({str(x).strip() for x in g if str(x).strip()}))
        if len(ids) < 2:
            continue
        for mid in ids:
            out[mid] = ids
    return out


def equivalent_media_source_ids(media_source_id: str) -> list[str]:
    """IDs à fusionner pour les agrégats (santé, traduction 24h)."""
    mid = (media_source_id or "").strip()
    if not mid:
        return []
    g = _id_to_sorted_group().get(mid)
    if g:
        return list(g)
    return [mid]
