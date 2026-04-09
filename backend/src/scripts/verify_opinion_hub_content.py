"""
Vérifie le **contenu réel** des articles (hubs liste revue), avec le même extracteur que la collecte.

Pour chaque média : collecte des liens depuis les hubs (+ URLs additionnelles des overrides),
puis télécharge jusqu’à N articles et contrôle longueur, titre, filtre éditorial.

Usage (dossier backend/) :
  python -m src.scripts.verify_opinion_hub_content
  python -m src.scripts.verify_opinion_hub_content --per-source 3 --max-media 10
  python -m src.scripts.verify_opinion_hub_content --ids ae_gulf_news,sa_arab_news
  python -m src.scripts.verify_opinion_hub_content --output data/CONTENT_VERIFY_REPORT.json

Prérequis : Playwright installé pour les pages derrière WAF :
  python -m playwright install chromium
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from src.config import get_settings
from src.services.article_body_format import (
    is_acceptable_article_title,
    is_substantial_article_body,
)
from src.services.editorial_scope import should_ingest_scraped_article
from src.services.hub_article_extract import extract_hub_article_page
from src.services.hub_collect import fetch_html_and_extract_hub_links
from src.services.hub_opinion_noise import should_reject_opinion_page
from src.services.hub_playwright import HubPlaywrightBrowser
from src.services.opinion_hub_overrides import clear_override_cache, merge_hub_override

REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REVUE_REGISTRY.json"

# Texte souvent présent quand le HTML est une page d’accès / abonnement (pas exhaustif).
_PAYWALL_MARKERS = (
    "subscribe to read",
    "subscribers only",
    "subscriber only",
    "sign in to read",
    "login to read",
    "register to read",
    "premium subscriber",
    "this article is for subscribers",
    "reserved for subscribers",
    "réservé aux abonnés",
    "abonnez-vous pour",
    "connectez-vous pour lire",
    "déjà abonné",
    "paywall",
    "for subscribers",
    "become a subscriber",
    # ar (échantillon fréquent)
    "للمشتركين فقط",
    "اشترك للقراءة",
    "سجل الدخول لقراءة",
)


def _paywall_suspected(text: str | None, title: str | None) -> tuple[bool, str]:
    """Heuristique : corps court ou vide + marqueurs type paywall dans titre/corps."""
    blob = f"{title or ''}\n{text or ''}".lower()
    if len(blob.strip()) < 12:
        return False, ""
    for m in _PAYWALL_MARKERS:
        if m.lower() in blob:
            # Éviter faux positifs si l’article est déjà long (corps réel + bannière en bas)
            if text and len(text.strip()) >= 400:
                continue
            return True, m
    return False, ""


DEFAULT_OUT = Path(__file__).resolve().parent.parent.parent / "data" / "CONTENT_VERIFY_REPORT.json"


def _print_safe(msg: str) -> None:
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", errors="replace").decode("ascii"))


def _ascii_preview(text: str, max_len: int = 240) -> str:
    if not text:
        return ""
    return " ".join(text.split()).encode("ascii", errors="replace").decode("ascii")[:max_len]


def _expand_hub_urls(source_id: str, hub_urls: list[str]) -> list[str]:
    if not hub_urls:
        return []
    base = merge_hub_override(source_id, hub_urls[0])
    extras = base.get("additional_hub_urls")
    extra_list: list[str] = []
    if isinstance(extras, list):
        extra_list = [u for u in extras if isinstance(u, str) and u.strip()]
    return list(dict.fromkeys([*hub_urls, *extra_list]))


async def _verify_one_article(
    url: str,
    pw: HubPlaywrightBrowser,
    pw_lock: asyncio.Lock,
) -> dict:
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
    noise = should_reject_opinion_page(url, title)
    ok = bool(substantial and title_ok and editorial_ok and not noise)
    reasons: list[str] = []
    if not substantial:
        reasons.append("corps_trop_court")
    if not title_ok:
        reasons.append("titre_inacceptable")
    if not editorial_ok:
        reasons.append("hors_perimetre_editorial")
    if noise:
        reasons.append("page_bruit")

    pw_flag, pw_marker = _paywall_suspected(text, title)
    if pw_flag and not ok:
        reasons.append("paywall_suspect")

    return {
        "url": url[:800],
        "ok": ok,
        "fetch_strategy": strat,
        "chars": len(text),
        "words": len(text.split()),
        "title": (title or "")[:400],
        "author": (author or "")[:200],
        "substantial": substantial,
        "title_ok": title_ok,
        "editorial_ok": editorial_ok,
        "preview_ascii": _ascii_preview(text),
        "paywall_suspected": pw_flag,
        "paywall_marker": pw_marker if pw_flag else "",
        "error": "|".join(reasons) if not ok else "",
    }


async def run_verify(
    *,
    max_media: int | None,
    per_source: int,
    only_active: bool,
    only_ids: list[str] | None,
    min_links: int,
) -> dict:
    clear_override_cache()
    if not REGISTRY_PATH.exists():
        print(f"Manquant: {REGISTRY_PATH}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    media_list = data.get("media", [])
    if only_active:
        media_list = [m for m in media_list if m.get("is_active", True)]
    if only_ids:
        want = {x.strip() for x in only_ids if x.strip()}
        media_list = [m for m in media_list if m.get("id") in want]
    if max_media is not None:
        media_list = media_list[:max_media]

    pw = HubPlaywrightBrowser()
    pw_lock = asyncio.Lock()
    summary = {
        "sources_total": len(media_list),
        "articles_target": 0,
        "articles_ok": 0,
        "articles_tried": 0,
        "sources_all_ok": 0,
        "articles_paywall_suspected": 0,
    }
    results: list[dict] = []

    try:
        for m in media_list:
            mid = m.get("id", "?")
            name = m.get("name", "?")
            hubs = _expand_hub_urls(mid, list(m.get("opinion_hub_urls") or []))
            if not hubs:
                results.append(
                    {
                        "id": mid,
                        "name": name,
                        "error": "no_hubs",
                        "articles": [],
                    },
                )
                continue

            seen: set[str] = set()
            article_urls: list[str] = []
            for hub in hubs:
                if len(article_urls) >= per_source + 15:
                    break
                links, meta = await fetch_html_and_extract_hub_links(
                    hub,
                    mid,
                    max_links=per_source + 20,
                    min_links=min_links,
                    pw=pw,
                    pw_lock=pw_lock,
                )
                for u in links:
                    if u not in seen:
                        seen.add(u)
                        article_urls.append(u)
                    if len(article_urls) >= per_source + 15:
                        break
                await asyncio.sleep(1.0)

            to_try = article_urls[:per_source]
            summary["articles_target"] += len(to_try)
            art_reports: list[dict] = []
            for u in to_try:
                summary["articles_tried"] += 1
                rep = await _verify_one_article(u, pw, pw_lock)
                art_reports.append(rep)
                if rep["ok"]:
                    summary["articles_ok"] += 1
                if rep.get("paywall_suspected"):
                    summary["articles_paywall_suspected"] += 1
                await asyncio.sleep(1.2)

            n_ok = sum(1 for r in art_reports if r["ok"])
            if to_try and n_ok == len(to_try):
                summary["sources_all_ok"] += 1

            results.append(
                {
                    "id": mid,
                    "name": name,
                    "hubs_used": len(hubs),
                    "links_found": len(article_urls),
                    "articles_requested": len(to_try),
                    "articles_ok": n_ok,
                    "articles": art_reports,
                },
            )
            _print_safe(
                f"[{mid}] {name}: contenu OK {n_ok}/{len(to_try)} "
                f"(liens collectés: {len(article_urls)})",
            )
    finally:
        await pw.stop()

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "per_source": per_source,
        "min_hub_links": min_links,
        "registry": str(REGISTRY_PATH),
        "summary": summary,
        "media": results,
    }


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Vérifie le contenu extrait des articles (pipeline production).",
    )
    ap.add_argument("--max-media", type=int, default=None)
    ap.add_argument("--per-source", type=int, default=3, help="Articles à tester par média")
    ap.add_argument("--min-hub-links", type=int, default=1, help="Seuil min liens hub (souvent 1 avec RSS)")
    ap.add_argument("--ids", type=str, default=None, help="Ids séparés par virgules")
    ap.add_argument("--include-inactive", action="store_true")
    ap.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    only_ids = [x.strip() for x in args.ids.split(",")] if args.ids else None

    t0 = time.perf_counter()
    report = asyncio.run(
        run_verify(
            max_media=args.max_media,
            per_source=max(1, args.per_source),
            only_active=not args.include_inactive,
            only_ids=only_ids,
            min_links=max(1, args.min_hub_links),
        )
    )
    elapsed = int(time.perf_counter() - t0)
    report["elapsed_seconds"] = elapsed

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    s = report["summary"]
    _print_safe("\n=== Synthèse contenu articles ===")
    _print_safe(f"Médias : {s['sources_total']}")
    _print_safe(f"Articles testés : {s['articles_tried']} (objectif cumulé : {s['articles_target']})")
    _print_safe(f"Articles OK (corps+titre+éditorial) : {s['articles_ok']}")
    _print_safe(
        f"Articles avec signaux paywall (heuristique, corps court) : "
        f"{s.get('articles_paywall_suspected', 0)}",
    )
    _print_safe(f"Médias avec 100% réussite sur l’échantillon : {s['sources_all_ok']}")
    _print_safe(f"Durée : {elapsed}s — Rapport : {args.output}")


if __name__ == "__main__":
    main()
