"""
Scraping enrichi (plan v2) — point d’extension pour une cascade type scraper/retenu_final.

Lorsque ``enhanced_scraper_enabled`` est false (défaut), ce module délègue au pipeline
``hub_article_extract`` existant (HTTP → curl_cffi → Playwright).
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from src.config import get_settings


def is_enhanced_scraper_active() -> bool:
    return bool(get_settings().enhanced_scraper_enabled)


async def extract_article_page_enhanced(
    url: str,
    *,
    pw: Any = None,
    pw_lock: asyncio.Lock | None = None,
):
    """
    Extraction article : délègue à ``hub_article_extract`` ; si ``enhanced_scraper_enabled``,
    un second passage Playwright avec défilement peut s’exécuter dans ``extract_hub_article_page``.
    """
    from src.services.hub_article_extract import extract_hub_article_page

    return await extract_hub_article_page(url, pw=pw, pw_lock=pw_lock)
