"""
Cache LRU en mémoire pour appels traduction LLM (réduit coût si même prompt).

Désactivé si `llm_translation_cache_max_entries == 0`.
"""

from __future__ import annotations

import hashlib
from collections import OrderedDict
from threading import Lock

_lock = Lock()
_cache: OrderedDict[str, str] = OrderedDict()


def _hash_key(system: str, prompt: str, model: str) -> str:
    raw = f"{model}\0{system}\0{prompt}".encode("utf-8", errors="replace")
    return hashlib.sha256(raw).hexdigest()


def get_cached(system: str, prompt: str, model: str) -> str | None:
    from src.config import get_settings

    max_n = get_settings().llm_translation_cache_max_entries
    if max_n <= 0:
        return None
    k = _hash_key(system, prompt, model)
    with _lock:
        if k not in _cache:
            return None
        _cache.move_to_end(k)
        return _cache[k]


def set_cached(system: str, prompt: str, model: str, text: str) -> None:
    from src.config import get_settings

    max_n = get_settings().llm_translation_cache_max_entries
    if max_n <= 0:
        return
    k = _hash_key(system, prompt, model)
    with _lock:
        _cache[k] = text
        _cache.move_to_end(k)
        while len(_cache) > max_n:
            _cache.popitem(last=False)
