"""
Overrides JSON pour hubs (Playwright, motifs d’URL, liens supplémentaires).
Fichier : backend/data/OPINION_HUB_OVERRIDES.json
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_DEFAULT_PATH = _DATA_DIR / "OPINION_HUB_OVERRIDES.json"

_cache: dict[str, Any] | None = None


def _host_key(netloc: str) -> str:
    n = (netloc or "").lower().split(":")[0]
    if n.startswith("www."):
        n = n[4:]
    return n


def load_opinion_hub_overrides(path: Path | None = None) -> dict[str, Any]:
    global _cache
    p = path or _DEFAULT_PATH
    if _cache is not None and path is None:
        return _cache
    if not p.exists():
        empty = {"by_source_id": {}, "by_domain": {}}
        if path is None:
            _cache = empty
        return empty
    raw = json.loads(p.read_text(encoding="utf-8"))
    if path is None:
        _cache = raw
    return raw


def merge_hub_override(source_id: str, hub_url: str) -> dict[str, Any]:
    """Fusion by_domain (suffixe) puis by_source_id (prioritaire)."""
    data = load_opinion_hub_overrides()
    dom = _host_key(urlparse(hub_url).netloc)
    merged: dict[str, Any] = {}

    by_domain: dict[str, Any] = data.get("by_domain") or {}
    # Correspondance : clé exacte ou suffixe (ex. alanba.com.kw)
    for key, cfg in by_domain.items():
        if not isinstance(cfg, dict):
            continue
        key_n = _host_key(str(key))
        if not key_n:
            continue
        if dom == key_n or dom.endswith("." + key_n):
            merged = {**merged, **cfg}

    sid = (data.get("by_source_id") or {}).get(source_id)
    if isinstance(sid, dict):
        merged = {**merged, **sid}

    return merged


def clear_override_cache() -> None:
    global _cache
    _cache = None
