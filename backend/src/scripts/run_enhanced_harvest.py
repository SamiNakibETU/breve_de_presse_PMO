"""
CLI : test d’extraction via ``extract_article_page_enhanced`` (wrapper hub / enrichi).

Usage :
  python -m src.scripts.run_enhanced_harvest --url https://...
"""

from __future__ import annotations

import argparse
import asyncio


async def _main() -> None:
    p = argparse.ArgumentParser(
        description="Test extraction page article (hub / scraper enrichi)",
    )
    p.add_argument(
        "--url",
        required=True,
        help="URL article à extraire (média du périmètre validé)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Afficher uniquement la configuration, sans requête",
    )
    args = p.parse_args()

    if args.dry_run:
        print(f"Dry-run : URL={args.url!r}")
        return

    from src.services.enhanced_scraper import (
        extract_article_page_enhanced,
        is_enhanced_scraper_active,
    )

    print(f"enhanced_scraper_enabled={is_enhanced_scraper_active()}")
    body, author, title, pub, strategy = await extract_article_page_enhanced(
        args.url,
    )
    print("strategy:", strategy)
    print("title:", (title or "")[:200])
    print("author:", author)
    print("published:", pub)
    blen = len(body or "")
    print(f"body_chars: {blen}")
    if body and blen > 0:
        preview = body[:600].replace("\n", " ")
        print("body_preview:", preview + ("…" if blen > 600 else ""))


if __name__ == "__main__":
    asyncio.run(_main())
