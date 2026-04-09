"""
Teste chaque URL de hub du registre revue (fetch + liens + échantillon article).

L’échantillon article utilise le même extracteur que la collecte (HTTP + curl_cffi + Playwright si besoin).
Voir aussi : python -m src.scripts.verify_opinion_hub_content pour N articles / source.

Usage (depuis backend/) :
  python -m src.scripts.validate_media_hubs
  python -m src.scripts.validate_media_hubs --max-media 10
  python -m src.scripts.validate_media_hubs --output data/HUB_VALIDATION_REPORT.json

Durée : plusieurs minutes pour ~66 médias × N hubs (respect des délais entre domaines).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
import time


def _print_safe(msg: str) -> None:
    """Windows cp1252 : évite UnicodeEncodeError sur tirets unicode dans les noms."""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", errors="replace").decode("ascii"))
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from src.config import get_settings
from src.services.article_body_format import (
    is_acceptable_article_title,
    is_substantial_article_body,
)
from src.services.editorial_scope import should_ingest_scraped_article
from src.services.hub_article_extract import extract_hub_article_page
from src.services.hub_collect import fetch_html_and_extract_hub_links
from src.services.hub_playwright import HubPlaywrightBrowser
from src.services.opinion_hub_overrides import clear_override_cache
from src.services.wayback_availability import fetch_wayback_availability

REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REVUE_REGISTRY.json"
DEFAULT_OUT = Path(__file__).resolve().parent.parent.parent / "data" / "HUB_VALIDATION_REPORT.json"


def _ascii_preview(text: str, max_len: int = 280) -> str:
    if not text:
        return ""
    one_line = " ".join(text.split())
    ascii_line = one_line.encode("ascii", errors="replace").decode("ascii")
    if not ascii_line:
        return ""
    head = ascii_line[: min(500, len(ascii_line))].lower()
    # Bandeaux cookies / CMP souvent au debut du texte extrait (ex. Gulf News + Playwright).
    if any(
        x in head
        for x in (
            "cookie",
            "vendors",
            "consent",
            "privacy policy",
            "we and our",
            "similar technologies",
        )
    ):
        for start in (1200, 800, 400):
            if len(ascii_line) > start + max_len:
                chunk = ascii_line[start : start + max_len].lstrip()
                if len(chunk) >= 40:
                    return chunk[:max_len]
        mid = max(0, len(ascii_line) // 3)
        return ascii_line[mid : mid + max_len]
    return ascii_line[:max_len]


async def _probe_article(
    url: str,
    pw: HubPlaywrightBrowser,
    pw_lock: asyncio.Lock,
) -> dict:
    """Identique au pipeline `OpinionHubScraper._extract_article` + garde-fous éditoriaux."""
    st = get_settings()
    min_chars = max(st.min_article_length, 180)
    min_words = st.opinion_hub_min_article_words

    body, author, title, _pub, strat, _img = await extract_hub_article_page(
        url,
        pw=pw,
        pw_lock=pw_lock,
    )
    text = body or ""
    substantial = is_substantial_article_body(text, min_chars=min_chars, min_words=min_words)
    title_ok = is_acceptable_article_title(title)
    editorial_ok = should_ingest_scraped_article(title or "", text)
    ok = bool(substantial and title_ok and editorial_ok)
    reasons: list[str] = []
    if not substantial:
        reasons.append("corps_trop_court")
    if not title_ok:
        reasons.append("titre_inacceptable")
    if not editorial_ok:
        reasons.append("hors_perimetre_editorial")

    return {
        "ok": ok,
        "chars": len(text),
        "words": len(text.split()),
        "min_chars": min_chars,
        "min_words": min_words,
        "fetch_strategy": strat,
        "title": (title or "")[:400],
        "author": (author or "")[:200],
        "substantial": substantial,
        "title_ok": title_ok,
        "editorial_ok": editorial_ok,
        "preview_ascii": _ascii_preview(text),
        "error": "|".join(reasons) if not ok else "",
    }


MIN_HUB_LINKS = 3

# Sous-chaînes d’URL : si le hub est une rubrique opinion, on évite de prendre le 1er lien RSS hors rubrique.
_HUB_PATH_HINT_TO_LINK_NEEDLE: list[tuple[str, tuple[str, ...]]] = [
    ("opinion", ("/opinion/", "/views/", "/column", "/editorial", "/blogs/")),
    ("views", ("/views/", "/opinion/")),
    ("column", ("/column", "/opinion/", "/مقالات",)),
    ("editorial", ("/editorial", "/opinion/")),
    ("رأي", ("/opinion/", "/views/", "/ar/opinion")),
]


def _preferred_sample_article_url(hub_url: str, links: list[str]) -> str:
    if not links:
        return ""
    try:
        path = (urlparse(hub_url).path or "").lower()
    except Exception:
        path = ""
    needles: tuple[str, ...] = ()
    for hint, n in _HUB_PATH_HINT_TO_LINK_NEEDLE:
        if hint in path:
            needles = n
            break
    if not needles:
        return links[0]
    low_links = [(u, u.lower()) for u in links]
    for needle in needles:
        for u, low in low_links:
            if needle in low:
                return u
    return links[0]


async def _probe_hub(
    hub_url: str,
    source_id: str,
    *,
    sample_article: bool,
    pw: HubPlaywrightBrowser,
    pw_lock: asyncio.Lock,
    batch_id: str | None = None,
    wayback_on_failure: bool = False,
) -> dict:
    t0 = time.perf_counter()
    links, meta = await fetch_html_and_extract_hub_links(
        hub_url,
        source_id,
        max_links=24,
        min_links=MIN_HUB_LINKS,
        pw=pw,
        pw_lock=pw_lock,
        batch_id=batch_id,
    )
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    diagnostics = {
        "diagnosis_class": meta.get("diagnosis_class"),
        "override_keys": meta.get("override_keys"),
        "page_diagnostics": meta.get("page_diagnostics"),
        "html_len": meta.get("html_len"),
        "strategy": meta.get("strategy"),
        "batch_id": meta.get("batch_id"),
    }
    out: dict = {
        "hub_url": hub_url,
        "fetch_ok": bool(meta.get("fetch_ok")),
        "fetch_error": (meta.get("fetch_error") or "")[:300],
        "strategy": meta.get("strategy", ""),
        "link_count": len(links),
        "meets_min_links": len(links) >= MIN_HUB_LINKS,
        "sample_links": links[:5],
        "article_sample": None,
        "elapsed_ms": elapsed_ms,
        "diagnostics": diagnostics,
        "diagnosis_class": meta.get("diagnosis_class"),
    }
    if sample_article and links:
        sample_url = _preferred_sample_article_url(hub_url, links)
        out["article_sample"] = await _probe_article(sample_url, pw, pw_lock)
        out["article_sample"]["url"] = sample_url[:500]
    st_probe = get_settings()
    if wayback_on_failure and not out["fetch_ok"]:
        out["wayback_availability"] = await fetch_wayback_availability(
            hub_url,
            timeout_s=float(st_probe.hub_wayback_timeout_seconds),
        )
    pause = float(st_probe.hub_validation_inter_probe_base_delay_seconds) + random.uniform(
        0.0,
        float(st_probe.hub_validation_inter_probe_jitter_seconds),
    )
    await asyncio.sleep(max(0.2, pause))
    return out


async def run_validation(
    *,
    max_media: int | None,
    sample_article: bool,
    only_active: bool,
    only_ids: list[str] | None,
    registry_path: Path | None = None,
    batch_id: str | None = None,
    batch_index: int | None = None,
    batch_size: int | None = None,
    wayback_on_failure: bool = False,
) -> dict:
    clear_override_cache()
    reg = registry_path or REGISTRY_PATH
    if not reg.is_file():
        print(f"Manquant: {reg} — lance d’abord import_media_revue_csv.", file=sys.stderr)
        sys.exit(1)

    data = json.loads(reg.read_text(encoding="utf-8"))
    media_list = data.get("media", [])
    if only_active:
        media_list = [m for m in media_list if m.get("is_active", True)]
    if only_ids:
        want = {x.strip() for x in only_ids if x.strip()}
        media_list = [m for m in media_list if m.get("id") in want]
    if max_media is not None:
        media_list = media_list[:max_media]

    results: list[dict] = []
    summary = {
        "hubs_total": 0,
        "hubs_fetch_ok": 0,
        "hubs_with_links": 0,
        "hubs_meeting_min_links": 0,
        "min_links_target": MIN_HUB_LINKS,
        "article_sample_ok": 0,
        "article_sample_tried": 0,
    }

    pw = HubPlaywrightBrowser()
    pw_lock = asyncio.Lock()
    try:
        for m in media_list:
            hubs = m.get("opinion_hub_urls") or []
            mid = m.get("id", "?")
            name = m.get("name", "?")
            entry = {
                "id": mid,
                "name": name,
                "country": m.get("country"),
                "is_active": m.get("is_active", True),
                "hubs": [],
            }
            for hub in hubs:
                summary["hubs_total"] += 1
                hreport = await _probe_hub(
                    hub,
                    mid,
                    sample_article=sample_article,
                    pw=pw,
                    pw_lock=pw_lock,
                    batch_id=batch_id,
                    wayback_on_failure=wayback_on_failure,
                )
                entry["hubs"].append(hreport)
                if hreport["fetch_ok"]:
                    summary["hubs_fetch_ok"] += 1
                if hreport.get("link_count", 0) > 0:
                    summary["hubs_with_links"] += 1
                if hreport.get("meets_min_links"):
                    summary["hubs_meeting_min_links"] += 1
                if hreport.get("article_sample"):
                    summary["article_sample_tried"] += 1
                    if hreport["article_sample"].get("ok"):
                        summary["article_sample_ok"] += 1

            results.append(entry)
            _print_safe(
                f"[{mid}] {name}: "
                f"{sum(1 for h in entry['hubs'] if h['fetch_ok'])}/{len(hubs)} hubs OK, "
                f">={MIN_HUB_LINKS} liens: {sum(1 for h in entry['hubs'] if h.get('meets_min_links'))}, "
                f"links max={max((h.get('link_count') or 0 for h in entry['hubs']), default=0)}",
            )
    finally:
        await pw.stop()

    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_registry": str(reg.resolve()),
        "summary": summary,
        "media": results,
    }
    if batch_id is not None:
        report["batch_id"] = batch_id
    if batch_index is not None:
        report["batch_index"] = batch_index
    if batch_size is not None:
        report["batch_size"] = batch_size
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Valide les hubs opinion (media revue).")
    ap.add_argument("--max-media", type=int, default=None, help="Limiter le nombre de médias")
    ap.add_argument(
        "--no-article-sample",
        action="store_true",
        help="Ne pas télécharger un 1er article (plus rapide)",
    )
    ap.add_argument(
        "--include-inactive",
        action="store_true",
        help="Inclure les médias is_active=false",
    )
    ap.add_argument("--output", type=Path, default=DEFAULT_OUT, help="Rapport JSON")
    ap.add_argument(
        "--registry",
        type=Path,
        default=None,
        help="Chemin vers MEDIA_REVUE_REGISTRY.json (défaut: data/MEDIA_REVUE_REGISTRY.json)",
    )
    ap.add_argument(
        "--ids",
        type=str,
        default=None,
        help="Filtrer par id média (séparés par des virgules), ex. bh_al_watan,jo_al_ghad",
    )
    ap.add_argument(
        "--wayback-on-failure",
        action="store_true",
        help="Si fetch hub en échec, ajouter wayback_availability au rapport (API archive.org).",
    )
    args = ap.parse_args()
    only_ids = [x.strip() for x in args.ids.split(",")] if args.ids else None

    report = asyncio.run(
        run_validation(
            max_media=args.max_media,
            sample_article=not args.no_article_sample,
            only_active=not args.include_inactive,
            only_ids=only_ids,
            registry_path=args.registry,
            wayback_on_failure=args.wayback_on_failure,
        )
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    s = report["summary"]
    _print_safe("\n=== Résumé ===")
    _print_safe(f"Hubs testés : {s['hubs_total']}")
    _print_safe(f"Fetch hub OK : {s['hubs_fetch_ok']}")
    _print_safe(f"Hubs avec >=1 lien article : {s['hubs_with_links']}")
    _print_safe(
        f"Hubs avec >={s.get('min_links_target', MIN_HUB_LINKS)} liens : {s.get('hubs_meeting_min_links', 0)}",
    )
    if s["article_sample_tried"]:
        _print_safe(
            f"Echantillon article OK : {s['article_sample_ok']}/{s['article_sample_tried']}",
        )
    _print_safe(f"Rapport : {args.output}")


if __name__ == "__main__":
    main()
