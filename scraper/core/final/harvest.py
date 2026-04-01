"""
Recolte 3 articles par media (registre revue de presse).
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.final.ultra_scraper_v3 import ScrapeResult, UltraScraperV3

# Hubs supplementaires (decouverte) — sans modifier le backend ; Israel Hayom : home seule = peu de liens article.
HUB_DISCOVERY_OVERRIDES: Dict[str, List[str]] = {
    "il_israel_hayon": [
        "https://www.israelhayom.com/opinions/",
        "https://www.israelhayom.com/opinions",
    ],
}


@dataclass
class MediaHarvestReport:
    media_id: str
    media_name: str
    hub_urls_tried: List[str]
    article_urls_attempted: List[str]
    articles_ok: int
    articles_target: int
    success: bool
    partial: bool
    errors: List[Dict[str, Any]]
    output_dir: str


def load_registry(path: Path) -> List[Dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict) and "media" in data:
        return [m for m in data["media"] if isinstance(m, dict) and m.get("is_active", True)]
    return [m for m in data if isinstance(m, dict)]


def hub_urls_for_media(m: Dict[str, Any]) -> List[str]:
    mid = str(m.get("id", ""))
    raw = m.get("opinion_hub_urls")
    out: List[str] = []
    if isinstance(raw, list) and raw:
        out = [str(u) for u in raw if u]
    elif isinstance(raw, str) and raw:
        out = [raw]
    elif m.get("rss_opinion_url"):
        out = [str(m["rss_opinion_url"])]
    elif m.get("url"):
        out = [str(m["url"])]
    extra = HUB_DISCOVERY_OVERRIDES.get(mid, [])
    merged: List[str] = []
    for u in [*extra, *out]:
        if u and u not in merged:
            merged.append(u)
    return merged


async def harvest_media(
    scraper: UltraScraperV3,
    media: Dict[str, Any],
    *,
    articles_target: int = 3,
    min_article_words: int = 120,
    max_link_attempts: int = 18,
) -> tuple[List[Dict[str, Any]], MediaHarvestReport]:
    mid = str(media.get("id", "unknown"))
    name = str(media.get("name", mid))
    hubs = hub_urls_for_media(media)
    collected: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    attempted_urls: List[str] = []
    links_pool: List[str] = []

    for hub in hubs:
        if len(collected) >= articles_target:
            break
        try:
            links = await scraper.discover_article_links(hub, max_links=28)
            for lk in links:
                if lk not in links_pool:
                    links_pool.append(lk)
        except Exception as e:
            errors.append({"hub": hub, "phase": "discover", "error": str(e)[:400]})

    for link in links_pool:
        if len(collected) >= articles_target:
            break
        if len(attempted_urls) >= max_link_attempts:
            break
        attempted_urls.append(link)
        r = await scraper.fetch_article(link, site_name=name, min_words=min_article_words)
        if r.success and r.content:
            collected.append(
                {
                    "url": r.url,
                    "title": r.title,
                    "content": r.content,
                    "word_count": r.word_count,
                    "method": r.method,
                    "collected_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        else:
            errors.append(
                {
                    "url": link,
                    "phase": "fetch_article",
                    "error": r.error or "low_words",
                    "word_count": r.word_count,
                }
            )

    # Repli : page hub / agregat si pas assez d'articles unitaires
    if len(collected) < articles_target and hubs:
        hub0 = hubs[0]
        r = await scraper.scrape(hub0, site_name=name)
        if r.success and r.content and r.word_count >= min_article_words:
            n = len(collected) + 1
            collected.append(
                {
                    "url": hub0,
                    "title": r.title or f"Hub aggregate ({name})",
                    "content": r.content,
                    "word_count": r.word_count,
                    "method": r.method,
                    "collected_at": datetime.now(timezone.utc).isoformat(),
                    "note": "fallback_hub_or_aggregate",
                }
            )

    ok = len(collected) >= articles_target
    partial = 0 < len(collected) < articles_target
    report = MediaHarvestReport(
        media_id=mid,
        media_name=name,
        hub_urls_tried=hubs,
        article_urls_attempted=attempted_urls,
        articles_ok=len(collected),
        articles_target=articles_target,
        success=ok,
        partial=partial,
        errors=errors,
        output_dir="",
    )
    return collected, report


async def run_full_harvest(
    registry_path: Path,
    output_root: Path,
    *,
    articles_target: int = 3,
    min_article_words: int = 120,
    verbose: bool = True,
    only_ids: Optional[List[str]] = None,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    output_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    run_dir = output_root / stamp
    run_dir.mkdir(parents=True)

    media_list = load_registry(registry_path)
    if only_ids:
        want = {x.strip() for x in only_ids if x}
        media_list = [m for m in media_list if str(m.get("id", "")) in want]
    if limit is not None and limit > 0:
        media_list = media_list[:limit]
    scraper = UltraScraperV3(min_words=200, verbose=verbose)

    summary_media: List[Dict[str, Any]] = []
    total_ok = 0
    total_partial = 0
    total_fail = 0

    for media in media_list:
        mid = str(media.get("id", "unknown"))
        safe_dir = "".join(c if c.isalnum() or c in "-_" else "_" for c in mid)
        mdir = run_dir / safe_dir
        mdir.mkdir(parents=True)

        articles, report = await harvest_media(
            scraper,
            media,
            articles_target=articles_target,
            min_article_words=min_article_words,
        )
        report.output_dir = str(mdir)

        for i, art in enumerate(articles, start=1):
            with open(mdir / f"article_{i:02d}.json", "w", encoding="utf-8") as f:
                json.dump(art, f, ensure_ascii=False, indent=2)

        meta = {**asdict(report), "articles": [a["url"] for a in articles]}
        with open(mdir / "meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        if report.success:
            total_ok += 1
        elif report.partial:
            total_partial += 1
        else:
            total_fail += 1

        summary_media.append(
            {
                "id": mid,
                "name": report.media_name,
                "success": report.success,
                "partial": report.partial,
                "articles_count": report.articles_ok,
                "hub_urls": report.hub_urls_tried,
            }
        )

    summary = {
        "run_id": stamp,
        "registry": str(registry_path),
        "articles_target_per_media": articles_target,
        "min_article_words": min_article_words,
        "total_media": len(media_list),
        "media_full_success": total_ok,
        "media_partial": total_partial,
        "media_failed": total_fail,
        "scraper_stats": scraper.get_stats(),
        "media": summary_media,
    }
    with open(run_dir / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    return summary
