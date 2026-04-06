"""IDs médias du registre « revue de presse » (CSV OLJ → MEDIA_REVUE_REGISTRY.json)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_REGISTRY_PATH = (
    Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REVUE_REGISTRY.json"
)


@lru_cache(maxsize=1)
def get_media_revue_registry_ids() -> frozenset[str]:
    """Ensemble des `id` présents dans le JSON registre (vide si fichier absent)."""
    if not _REGISTRY_PATH.is_file():
        return frozenset()
    with _REGISTRY_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    media = data.get("media") or []
    out: set[str] = set()
    for m in media:
        mid = str(m.get("id", "")).strip()
        if mid:
            out.add(mid)
    return frozenset(out)
