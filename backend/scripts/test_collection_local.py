"""
Test local de la pipeline de collecte OLJ — sans base de données.

Lit les sources depuis MEDIA_REVUE_REGISTRY.json,
tente de collecter 3 articles par source via les modules hub_collect + hub_article_extract,
et produit un rapport JSON + Markdown dans test_collection_results/.

Usage (depuis backend/) :
    python scripts/test_collection_local.py
    python scripts/test_collection_local.py --limit 5        # 5 premières sources seulement
    python scripts/test_collection_local.py --source bh_al_watan  # une source précise
    python scripts/test_collection_local.py --articles 5     # 5 articles par source
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Forcer UTF-8 pour stdout/stderr (PowerShell sur Windows)
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ("utf-8", "utf8"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Ajouter le répertoire backend au PYTHONPATH ──────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Variables d'env minimales pour satisfaire pydantic-settings
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test_dummy")
os.environ.setdefault("GROQ_API_KEY", os.environ.get("GROQ_API_KEY", "placeholder"))
os.environ.setdefault("ANTHROPIC_API_KEY", os.environ.get("ANTHROPIC_API_KEY", "placeholder"))
os.environ.setdefault("COHERE_API_KEY", os.environ.get("COHERE_API_KEY", "placeholder"))
os.environ.setdefault("INTERNAL_API_KEY", "placeholder")

# ── Imports pipeline ──────────────────────────────────────────────────────────
from src.services.hub_collect import fetch_html_and_extract_hub_links
from src.services.hub_article_extract import extract_hub_article_page
from src.services.hub_playwright import PlaywrightPool
from src.services.article_body_format import is_substantial_article_body

# ─────────────────────────────────────────────────────────────────────────────
REGISTRY_PATH = BACKEND_DIR / "data" / "MEDIA_REVUE_REGISTRY.json"
OUT_DIR = BACKEND_DIR / "test_collection_results"
MAX_ARTICLES_PER_SOURCE = 3
MAX_CONCURRENT_SOURCES = 4
# Timeout global par source (évite tout blocage indéfini Playwright)
SOURCE_TIMEOUT_S = 180

QUALITY_THRESHOLDS = {
    "words_full": 300,
    "words_minimal": 80,
    "image_bonus": True,
}


def load_registry() -> list[dict]:
    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return [m for m in data.get("media", []) if m.get("is_active") and m.get("opinion_hub_urls")]


def word_count(text: str) -> int:
    return len(text.split()) if text else 0


def quality_label(wc: int, has_image: bool) -> str:
    if wc >= QUALITY_THRESHOLDS["words_full"]:
        label = "FULL"
    elif wc >= QUALITY_THRESHOLDS["words_minimal"]:
        label = "PARTIAL"
    elif wc > 0:
        label = "MINIMAL"
    else:
        label = "FAILED"
    if has_image and label != "FAILED":
        label += "+IMG"
    return label


def detect_artifacts(text: str) -> list[str]:
    """Détecte les artefacts de scraping courants."""
    found = []
    checks = [
        ("cookie_banner", ["accept cookies", "cookie settings", "we use cookies", "accepter les cookies"]),
        ("nav_menu", ["home\n", "menu\n", "sign in\n", "log in\n"]),
        ("social_share", ["share on facebook", "share on twitter", "tweet this", "تابعونا"]),
        ("paywall_stub", ["subscribe to read", "abonnez-vous pour lire", "اشترك الآن"]),
        ("ad_content", ["advertisement", "sponsored content", "publicité"]),
    ]
    lower = text.lower()[:2000]
    for artifact_name, markers in checks:
        if any(m in lower for m in markers):
            found.append(artifact_name)
    return found


async def _test_one_source_inner(
    source: dict,
    pw: PlaywrightPool,
    pw_lock: asyncio.Lock,
    max_articles: int,
) -> dict:
    source_id = source["id"]
    source_name = source["name"]
    hub_urls: list[str] = source.get("opinion_hub_urls") or []

    result: dict = {
        "id": source_id,
        "name": source_name,
        "country": source.get("country", ""),
        "country_code": source.get("country_code", ""),
        "language": source.get("languages", ["?"])[0],
        "hub_urls": hub_urls,
        "hub_ok": False,
        "links_found": 0,
        "articles": [],
        "articles_full": 0,
        "articles_partial": 0,
        "articles_minimal": 0,
        "articles_failed": 0,
        "has_images": 0,
        "artifacts_detected": [],
        "status": "not_tested",
        "error": "",
        "elapsed_s": 0.0,
    }

    t0 = time.perf_counter()
    try:
        print(f"[{source_id}] → Hub fetch…")

        # Collecter les liens depuis tous les hub_urls
        all_links: list[str] = []
        for hub_url in hub_urls:
            links, _meta = await fetch_html_and_extract_hub_links(
                source_id=source_id,
                hub_url=hub_url.strip(),
                pw=pw,
                pw_lock=pw_lock,
                max_links=max_articles * 6,
                min_links=1,
            )
            for lnk in links:
                if lnk not in all_links:
                    all_links.append(lnk)
            if all_links:
                result["hub_ok"] = True

        result["links_found"] = len(all_links)

        if not all_links:
            result["status"] = "no_links"
            result["error"] = "Aucun lien d'article trouvé sur le hub"
            result["elapsed_s"] = round(time.perf_counter() - t0, 2)
            return result

        print(f"[{source_id}] → {len(all_links)} liens, extraction {min(max_articles, len(all_links))} articles…")

        # Extraire les articles (avec timeout individuel par article)
        article_links = all_links[:max_articles]
        for url in article_links:
            try:
                body, author, title, pub_date, strategy, image_url = await asyncio.wait_for(
                    extract_hub_article_page(url, pw=pw, pw_lock=pw_lock),
                    timeout=90,
                )
                wc = word_count(body or "")
                artifacts = detect_artifacts(body or "")
                q = quality_label(wc, bool(image_url))

                art = {
                    "url": url,
                    "title": title or "",
                    "author": author or "",
                    "pub_date": pub_date.isoformat() if pub_date else "",
                    "word_count": wc,
                    "quality": q,
                    "has_image": bool(image_url),
                    "image_url": image_url or "",
                    "strategy": strategy,
                    "artifacts": artifacts,
                    "body_preview": (body or "")[:400].replace("\n", " ") if body else "",
                }
                result["articles"].append(art)

                if "FULL" in q:
                    result["articles_full"] += 1
                elif "PARTIAL" in q:
                    result["articles_partial"] += 1
                elif "MINIMAL" in q:
                    result["articles_minimal"] += 1
                else:
                    result["articles_failed"] += 1
                if image_url:
                    result["has_images"] += 1
                for a in artifacts:
                    if a not in result["artifacts_detected"]:
                        result["artifacts_detected"].append(a)

                icon = "✅" if "FULL" in q else ("⚠️" if "PARTIAL" in q else "❌")
                print(f"  {icon} {url[:80]} → {wc}w [{q}]")
                await asyncio.sleep(0.5)

            except asyncio.TimeoutError:
                result["articles"].append({"url": url, "error": "article_timeout_90s", "quality": "TIMEOUT"})
                result["articles_failed"] += 1
                print(f"  ⏱ {url[:80]} → TIMEOUT 90s")
            except Exception as exc:
                result["articles"].append({"url": url, "error": str(exc)[:200], "quality": "ERROR"})
                result["articles_failed"] += 1
                print(f"  ❌ {url[:80]} → {exc!s:.80}")

        # Statut global
        total = len(result["articles"])
        good = result["articles_full"] + result["articles_partial"]
        if good >= max(1, total // 2):
            result["status"] = "ok"
        elif good > 0:
            result["status"] = "partial"
        else:
            result["status"] = "failed"

    except Exception as exc:
        result["status"] = "error"
        result["error"] = str(exc)[:500]
        print(f"[{source_id}] ❌ ERREUR: {exc!s:.200}")

    result["elapsed_s"] = round(time.perf_counter() - t0, 2)
    return result


async def test_one_source(
    source: dict,
    pw: PlaywrightPool,
    pw_lock: asyncio.Lock,
    sem: asyncio.Semaphore,
    max_articles: int = MAX_ARTICLES_PER_SOURCE,
) -> dict:
    """Wrapper avec sémaphore de concurrence + timeout global par source."""
    async with sem:
        try:
            return await asyncio.wait_for(
                _test_one_source_inner(source, pw, pw_lock, max_articles),
                timeout=SOURCE_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            print(f"[{source['id']}] ⏱ TIMEOUT global {SOURCE_TIMEOUT_S}s — source ignorée")
            return {
                "id": source["id"],
                "name": source["name"],
                "country": source.get("country", ""),
                "country_code": source.get("country_code", ""),
                "language": source.get("languages", ["?"])[0],
                "hub_urls": source.get("opinion_hub_urls") or [],
                "hub_ok": False,
                "links_found": 0,
                "articles": [],
                "articles_full": 0,
                "articles_partial": 0,
                "articles_minimal": 0,
                "articles_failed": 0,
                "has_images": 0,
                "artifacts_detected": [],
                "status": "timeout",
                "error": f"Source timeout après {SOURCE_TIMEOUT_S}s",
                "elapsed_s": SOURCE_TIMEOUT_S,
            }


def build_markdown_report(results: list[dict], elapsed_total: float) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    
    ok = [r for r in results if r["status"] == "ok"]
    partial = [r for r in results if r["status"] == "partial"]
    failed = [r for r in results if r["status"] in ("failed", "error", "no_links")]
    
    total_articles = sum(len(r["articles"]) for r in results)
    total_full = sum(r["articles_full"] for r in results)
    total_partial_q = sum(r["articles_partial"] for r in results)
    total_failed = sum(r["articles_failed"] for r in results)
    total_images = sum(r["has_images"] for r in results)
    pct_full = round(100 * total_full / max(1, total_articles), 1)
    pct_ok_sources = round(100 * len(ok) / max(1, len(results)), 1)
    
    md = f"""# 🔍 Rapport de collecte OLJ — Test local
**Date** : {ts}  
**Durée totale** : {round(elapsed_total, 1)}s  
**Sources testées** : {len(results)}

---

## 📊 Résumé global

| Métrique | Valeur |
|----------|--------|
| Sources fonctionnelles (≥50% articles OK) | **{len(ok)} / {len(results)} ({pct_ok_sources}%)** |
| Sources partielles | {len(partial)} |
| Sources échouées | {len(failed)} |
| Articles extraits | {total_articles} |
| Qualité FULL (>300 mots) | **{total_full} ({pct_full}%)** |
| Qualité PARTIAL (80-300 mots) | {total_partial_q} |
| Articles avec image | {total_images} |

---

## ✅ Sources fonctionnelles ({len(ok)})

| # | Source | Pays | Lang | FULL | PARTIAL | FAILED | Images | Artefacts |
|---|--------|------|------|------|---------|--------|--------|-----------|
"""
    for i, r in enumerate(ok, 1):
        art_flag = "⚠️ " + ", ".join(r["artifacts_detected"]) if r["artifacts_detected"] else "—"
        md += f"| {i} | **{r['name']}** | {r['country_code']} | {r['language']} | {r['articles_full']} | {r['articles_partial']} | {r['articles_failed']} | {r['has_images']} | {art_flag} |\n"

    md += f"""
---

## ⚠️ Sources partielles ({len(partial)})

| # | Source | Pays | FULL | PARTIAL | FAILED | Problème |
|---|--------|------|------|---------|--------|---------|
"""
    for i, r in enumerate(partial, 1):
        issue = r.get("error") or (f"{r['articles_failed']} articles échoués sur {len(r['articles'])}")
        md += f"| {i} | {r['name']} | {r['country_code']} | {r['articles_full']} | {r['articles_partial']} | {r['articles_failed']} | {issue[:80]} |\n"

    md += f"""
---

## ❌ Sources échouées ({len(failed)})

| # | Source | Pays | Statut | Problème |
|---|--------|------|--------|---------|
"""
    for i, r in enumerate(failed, 1):
        issue = r.get("error") or r.get("status", "?")
        md += f"| {i} | {r['name']} | {r['country_code']} | {r['status']} | {issue[:120]} |\n"

    md += """
---

## 📰 Détail par source

"""
    for r in results:
        status_emoji = "✅" if r["status"] == "ok" else ("⚠️" if r["status"] == "partial" else "❌")
        md += f"### {status_emoji} {r['name']} (`{r['id']}`)\n\n"
        md += f"- **Pays** : {r['country']} ({r['country_code']}) · **Langue** : {r['language']}\n"
        md += f"- **Liens trouvés** : {r['links_found']} · **Articles testés** : {len(r['articles'])}\n"
        md += f"- **Temps** : {r['elapsed_s']}s\n"
        if r.get("error"):
            md += f"- **Erreur** : `{r['error'][:200]}`\n"
        for art in r["articles"]:
            if "error" in art:
                md += f"  - ❌ `{art['url'][:80]}` → {art['error'][:100]}\n"
            else:
                icon = "✅" if "FULL" in art["quality"] else ("⚠️" if "PARTIAL" in art["quality"] else "❌")
                img = "🖼️" if art["has_image"] else ""
                md += (
                    f"  - {icon} **{art['word_count']}w** [{art['quality']}] {img} "
                    f"`{art.get('title', '')[:60]}` ([url]({art['url'][:100]}))\n"
                )
                if art.get("body_preview"):
                    md += f"    > {art['body_preview'][:200]}…\n"
        md += "\n"

    return md


async def _test_with_timeout(src: dict, pw: "PlaywrightPool", pw_lock: asyncio.Lock,
                             sem: asyncio.Semaphore, max_articles: int) -> dict:
    """Enveloppe avec timeout global par source pour éviter tout blocage."""
    try:
        return await asyncio.wait_for(
            test_one_source(src, pw, pw_lock, sem, max_articles),
            timeout=SOURCE_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        print(f"[{src['id']}] ⏱ TIMEOUT ({SOURCE_TIMEOUT_S}s) — source ignorée")
        return {
            "id": src["id"], "name": src["name"],
            "country": src.get("country", ""), "country_code": src.get("country_code", ""),
            "language": src.get("languages", ["?"])[0],
            "hub_urls": src.get("opinion_hub_urls", []),
            "hub_ok": False, "links_found": 0, "articles": [],
            "articles_full": 0, "articles_partial": 0, "articles_minimal": 0, "articles_failed": 0,
            "has_images": 0, "artifacts_detected": [],
            "status": "timeout", "error": f"Timeout global {SOURCE_TIMEOUT_S}s dépassé",
            "elapsed_s": SOURCE_TIMEOUT_S,
        }


async def run_tests(sources: list[dict], max_articles: int) -> list[dict]:
    pw = PlaywrightPool(max_contexts=3)
    pw_lock = asyncio.Lock()
    sem = asyncio.Semaphore(MAX_CONCURRENT_SOURCES)
    
    try:
        tasks = [
            _test_with_timeout(src, pw, pw_lock, sem, max_articles)
            for src in sources
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)
    finally:
        await pw.stop()
    
    return list(results)


def main() -> None:
    parser = argparse.ArgumentParser(description="Test local collection pipeline OLJ")
    parser.add_argument("--limit", type=int, default=0, help="Limiter à N sources (0 = toutes)")
    parser.add_argument("--source", type=str, action="append", dest="sources", default=[],
                        help="ID d'une source (répétable : --source a --source b)")
    parser.add_argument("--articles", type=int, default=3, help="Nb articles par source (défaut 3)")
    args = parser.parse_args()
    
    sources = load_registry()
    print(f"✅ Registre chargé : {len(sources)} sources actives\n")
    
    if args.sources:
        ids = set(args.sources)
        sources = [s for s in sources if s["id"] in ids]
        if not sources:
            print(f"❌ Sources '{args.sources}' non trouvées.")
            sys.exit(1)
    elif args.limit > 0:
        sources = sources[:args.limit]
    
    print(f"🚀 Test de {len(sources)} source(s), {args.articles} articles max par source\n")
    print("=" * 70)
    
    OUT_DIR.mkdir(exist_ok=True)
    
    t_start = time.perf_counter()
    results = asyncio.run(run_tests(sources, args.articles))
    elapsed = time.perf_counter() - t_start
    
    print("\n" + "=" * 70)
    print(f"✅ Test terminé en {elapsed:.1f}s\n")
    
    # Sauvegarder JSON
    ts_str = datetime.now().strftime("%Y%m%d_%H%M")
    json_path = OUT_DIR / f"results_{ts_str}.json"
    md_path = OUT_DIR / f"report_{ts_str}.md"
    
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"timestamp": datetime.now().isoformat(), "elapsed_s": elapsed, "results": results}, f, ensure_ascii=False, indent=2, default=str)
    
    md_content = build_markdown_report(results, elapsed)
    md_path.write_text(md_content, encoding="utf-8")
    
    # Résumé console
    ok = [r for r in results if r["status"] == "ok"]
    partial = [r for r in results if r["status"] == "partial"]
    failed = [r for r in results if r["status"] in ("failed", "error", "no_links")]
    total_art = sum(len(r["articles"]) for r in results)
    total_full = sum(r["articles_full"] for r in results)
    total_img = sum(r["has_images"] for r in results)
    
    print(f"📊 RÉSUMÉ FINAL")
    print(f"   Sources OK        : {len(ok)} / {len(results)}")
    print(f"   Sources partielles: {len(partial)}")
    print(f"   Sources échouées  : {len(failed)}")
    print(f"   Articles extraits : {total_art}")
    print(f"   Qualité FULL      : {total_full} ({round(100*total_full/max(1,total_art),1)}%)")
    print(f"   Avec image        : {total_img}")
    print(f"\n📄 Rapport JSON  : {json_path}")
    print(f"📄 Rapport MD    : {md_path}")
    
    if failed:
        print(f"\n❌ Sources échouées:")
        for r in failed:
            print(f"   - {r['name']} ({r['country_code']}) : {r.get('error', r['status'])[:80]}")


if __name__ == "__main__":
    main()
