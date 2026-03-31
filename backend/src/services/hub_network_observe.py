"""
Observation réseau Playwright (requêtes / réponses / WebSockets) pour diagnostic R&D.

Usage : script CLI `observe_hub_network` ou import pour une URL du registre.
Les URLs et métadonnées sont tronquées pour limiter la taille des exports.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any
from urllib.parse import urlparse

from src.services.hub_playwright import PLAYWRIGHT_AVAILABLE

_MAX_URL_LEN = 500
_MAX_EVENTS = 250


def _clip(url: str) -> str:
    u = (url or "").strip()
    return u[:_MAX_URL_LEN] + ("…" if len(u) > _MAX_URL_LEN else "")


async def observe_hub_network(
    url: str,
    *,
    wait_after_load_ms: int = 3500,
    block_service_workers: bool = True,
    headless: bool = True,
) -> dict[str, Any]:
    """
    Ouvre l’URL une fois, enregistre un résumé du trafic (pas le corps des réponses).
    """
    t0 = time.perf_counter()
    out: dict[str, Any] = {
        "url": url,
        "ok": False,
        "error": None,
        "elapsed_ms": 0,
        "final_url": None,
        "requests": [],
        "responses": [],
        "websockets": [],
    }
    if not PLAYWRIGHT_AVAILABLE:
        out["error"] = "playwright_not_installed"
        return out

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        out["error"] = "playwright_import_failed"
        return out

    sw_block = "block" if block_service_workers else None
    requests: list[dict[str, Any]] = []
    responses: list[dict[str, Any]] = []
    websockets: list[dict[str, Any]] = []

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=headless,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                ],
                ignore_default_args=["--enable-automation"],
            )
            ctx_kw: dict[str, Any] = {
                "user_agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                ),
                "viewport": {"width": 1366, "height": 768},
                "locale": "en-US",
            }
            if sw_block is not None:
                ctx_kw["service_workers"] = sw_block
            context = await browser.new_context(**ctx_kw)
            await context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});",
            )
            page = await context.new_page()

            def on_request(req: Any) -> None:
                if len(requests) >= _MAX_EVENTS:
                    return
                try:
                    requests.append(
                        {
                            "method": req.method,
                            "url": _clip(req.url),
                            "resource_type": getattr(req, "resource_type", None),
                        },
                    )
                except Exception:
                    pass

            def on_response(resp: Any) -> None:
                if len(responses) >= _MAX_EVENTS:
                    return
                try:
                    responses.append(
                        {
                            "url": _clip(resp.url),
                            "status": resp.status,
                        },
                    )
                except Exception:
                    pass

            def on_websocket(ws: Any) -> None:
                if len(websockets) >= 80:
                    return
                try:
                    websockets.append({"url": _clip(ws.url)})
                except Exception:
                    pass

            page.on("request", on_request)
            page.on("response", on_response)
            page.on("websocket", on_websocket)

            await page.goto(url, wait_until="domcontentloaded", timeout=90000)
            await asyncio.sleep(min(max(wait_after_load_ms, 500), 30000) / 1000.0)
            final = page.url
            html = await page.content()
            await context.close()
            await browser.close()

        out["ok"] = True
        out["final_url"] = final
        out["html_len"] = len(html or "")
        out["host"] = _norm_host(final or url)
    except Exception as exc:
        out["error"] = f"{type(exc).__name__}:{str(exc)[:200]}"

    out["requests"] = requests
    out["responses"] = responses
    out["websockets"] = websockets
    out["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
    return out


def _norm_host(page_url: str) -> str:
    try:
        n = urlparse(page_url).netloc.lower()
        if n.startswith("www."):
            return n[4:]
        return n
    except Exception:
        return ""
