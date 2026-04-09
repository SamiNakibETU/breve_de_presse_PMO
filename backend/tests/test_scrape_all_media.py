"""
Vérification E2E optionnelle : découverte hub + extraction article par média du registre.

Définir ``RUN_MEDIA_SCRAPE_E2E=1`` pour exécuter le parcours réseau (long, dépend des sites).
Sans cette variable, seuls les tests de structure / registre s’exécutent.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_REGISTRY = _BACKEND_ROOT / "data" / "MEDIA_REVUE_REGISTRY.json"


def test_media_registry_json_loads() -> None:
    assert _REGISTRY.is_file(), f"Registre manquant : {_REGISTRY}"
    raw = json.loads(_REGISTRY.read_text(encoding="utf-8"))
    entries = raw.get("media") or raw.get("entries") or raw
    if isinstance(entries, dict):
        items = list(entries.values())
    else:
        items = list(entries) if isinstance(entries, list) else []
    assert len(items) >= 1
    first = items[0]
    assert isinstance(first, dict)
    assert first.get("id"), "Chaque entrée doit avoir un id"


@pytest.mark.asyncio
@pytest.mark.skipif(
    os.getenv("RUN_MEDIA_SCRAPE_E2E") != "1",
    reason="Réseau (définir RUN_MEDIA_SCRAPE_E2E=1 pour le parcours complet)",
)
async def test_scrape_all_media_report() -> None:
    from src.services.hub_collect import fetch_html_and_extract_hub_links
    from src.services.hub_article_extract import extract_hub_article_page

    raw = json.loads(_REGISTRY.read_text(encoding="utf-8"))
    entries = raw.get("media") or raw.get("entries") or raw
    if isinstance(entries, dict):
        medias = list(entries.values())
    else:
        medias = list(entries) if isinstance(entries, list) else []

    report: list[dict] = []
    for m in medias:
        mid = str(m.get("id") or "").strip()
        hubs = m.get("opinion_hub_urls") or m.get("hub_urls") or []
        if not mid or not hubs:
            report.append(
                {
                    "id": mid or "?",
                    "ok": False,
                    "error": "pas_de_hub",
                }
            )
            continue
        hub_url = str(hubs[0]).strip()
        try:
            links, meta = await fetch_html_and_extract_hub_links(
                hub_url,
                mid,
                max_links=8,
                min_links=1,
            )
            n = len(links)
            body: str | None = None
            body_ok = False
            if links:
                body, _a, _t, _d, _s, _img = await extract_hub_article_page(links[0])
                body_ok = bool(body and len((body or "").split()) >= 80)
            report.append(
                {
                    "id": mid,
                    "ok": n >= 1 and body_ok,
                    "links_found": n,
                    "sample_url": links[0] if links else None,
                    "body_words": len((body or "").split()) if body else 0,
                    "fetch_meta": {k: meta.get(k) for k in ("strategy", "fetch_ok", "html_len")},
                }
            )
        except Exception as exc:
            report.append({"id": mid, "ok": False, "error": str(exc)[:200]})

    out_path = _BACKEND_ROOT / "data" / "scrape_e2e_report.json"
    out_path.write_text(
        json.dumps({"sources": report}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    failures = [r for r in report if not r.get("ok")]
    assert len(failures) == 0, f"Échecs : {failures[:5]}… (rapport : {out_path})"
