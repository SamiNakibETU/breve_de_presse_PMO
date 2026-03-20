"""
Lance la collecte des médias `collection_method=opinion_hub` (liste revue).

Objectif par source : au moins `OPINION_HUB_MIN_ARTICLES_SAVED` articles (défaut 3),
corps normalisé (paragraphes), longueur min `MIN_ARTICLE_LENGTH` + nombre de mots.

Usage (depuis le dossier backend/) :
  python -m src.scripts.run_opinion_hub_collect

Variables d’environnement (optionnel) : voir `src.config.Settings`
  OPINION_HUB_MIN_ARTICLES_SAVED, OPINION_HUB_MIN_ARTICLE_WORDS, MIN_ARTICLE_LENGTH, …

Prérequis : DB migrée + `seed_media` ; Playwright installé pour les sites WAF :
  python -m playwright install chromium
"""

from __future__ import annotations

import asyncio
import json
import sys

from src.services.opinion_hub_scraper import run_opinion_hub_scraping


def main() -> None:
    try:
        stats = asyncio.run(run_opinion_hub_scraping())
    except Exception as exc:
        print(json.dumps({"error": str(exc)[:500]}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
