"""Cache disque optionnel pour HTML hub (réduit la pression sur les origines)."""

from __future__ import annotations

import hashlib
import time
from pathlib import Path

from src.config import get_settings
from src.services import metrics as app_metrics

_CACHE_ROOT = Path(__file__).resolve().parent.parent.parent / "data" / ".cache" / "hub_html"


def _key(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def cache_get(url: str) -> str | None:
    settings = get_settings()
    ttl = int(getattr(settings, "hub_html_cache_ttl_seconds", 0) or 0)
    if ttl <= 0:
        return None
    path = _CACHE_ROOT / _key(url)[:2] / _key(url)
    if not path.is_file():
        return None
    age = time.time() - path.stat().st_mtime
    if age > ttl:
        return None
    try:
        app_metrics.inc("hub_html_cache.hit")
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def cache_set(url: str, html: str) -> None:
    settings = get_settings()
    ttl = int(getattr(settings, "hub_html_cache_ttl_seconds", 0) or 0)
    if ttl <= 0 or not html or len(html) < 400:
        return
    h = _key(url)
    dirp = _CACHE_ROOT / h[:2]
    try:
        dirp.mkdir(parents=True, exist_ok=True)
        (dirp / h).write_text(html, encoding="utf-8")
        app_metrics.inc("hub_html_cache.set")
    except OSError:
        pass
