"""
Package olj_revue — pipeline retenu pour la collecte « opinion » (registre MEDIA_REVUE).

Point d'entree CLI : ``python run_harvest.py`` depuis le dossier parent ``retenu_final/``.

API programmatique ::
    from olj_revue import UltraScraperV3, run_full_harvest
    import asyncio
    asyncio.run(run_full_harvest(registry_path, output_dir))
"""

from .harvest import harvest_media, load_registry, run_full_harvest
from .scrape_cascade import ScrapeResult, UltraScraperV3

__all__ = [
    "UltraScraperV3",
    "ScrapeResult",
    "harvest_media",
    "load_registry",
    "run_full_harvest",
]
