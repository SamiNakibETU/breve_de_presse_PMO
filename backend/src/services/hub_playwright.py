"""
Fetch HTML des hubs via Chromium (sites 403 / anti-bot / rendu JS).
Une instance par « session » (validation ou opinion_hub) — mutex côté appelant si besoin.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

import structlog

from src.services.hub_fetch import sanitize_structlog_payload
from src.services.hub_rss import is_cloudflare_interstitial_html

logger = structlog.get_logger(__name__)


def _log_ex(ctx: dict[str, Any] | None, **fields: Any) -> dict[str, Any]:
    out = dict(ctx or {})
    out.update({k: v for k, v in fields.items() if v is not None})
    return sanitize_structlog_payload(out)

try:
    from playwright.async_api import async_playwright

    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    async_playwright = None  # type: ignore[misc, assignment]
    PLAYWRIGHT_AVAILABLE = False


class HubPlaywrightBrowser:
    """Navigateur réutilisable ; thread-safe si un seul appel à la fois (utiliser un Lock)."""

    def __init__(self) -> None:
        self._playwright = None
        self._browser = None
        self._context = None
        self._start_failed = False

    @property
    def started(self) -> bool:
        return self._context is not None

    async def start(self) -> bool:
        if not PLAYWRIGHT_AVAILABLE:
            return False
        if self._start_failed:
            return False
        if self._context is not None:
            return True
        try:
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                ],
                ignore_default_args=["--enable-automation"],
            )
            self._context = await self._browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1366, "height": 768},
                locale="en-US",
                extra_http_headers={
                    "Accept-Language": "en-US,en;q=0.9,ar;q=0.85,fr;q=0.8",
                },
            )
            await self._context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});",
            )
            logger.info("hub_playwright.started")
            return True
        except Exception as exc:
            # Windows cp1252 : message Playwright peut contenir des caractères box-drawing
            safe_err = str(exc).encode("ascii", errors="replace").decode("ascii")[:200]
            try:
                logger.warning("hub_playwright.start_failed", error=safe_err)
            except Exception:
                pass
            await self.stop()
            self._start_failed = True
            return False

    async def fetch_html(
        self,
        url: str,
        *,
        wait_ms: int = 4000,
        timeout_ms: int = 65000,
        scroll_page: bool = False,
        wait_until: str = "domcontentloaded",
        wait_for_selector: str | None = None,
        log_extra: dict[str, Any] | None = None,
        block_heavy_assets: bool = False,
    ) -> tuple[Optional[str], str]:
        if not self._context:
            logger.debug(
                "hub_playwright.fetch_done",
                **_log_ex(
                    log_extra,
                    stage="playwright",
                    attempt=1,
                    http_status=0,
                    content_type="",
                    html_len=0,
                    body_bytes=0,
                    cf_interstitial=False,
                    elapsed_ms=0,
                    error_code="playwright_not_started",
                    url=url[:160],
                ),
            )
            return None, "playwright_not_started"
        page = await self._context.new_page()
        t0 = time.perf_counter()
        if block_heavy_assets:

            async def _route_handler(route: Any) -> None:
                try:
                    rt = route.request.resource_type
                    if rt in ("image", "media", "font"):
                        await route.abort()
                    else:
                        await route.continue_()
                except Exception:
                    try:
                        await route.continue_()
                    except Exception:
                        pass

            await page.route("**/*", _route_handler)
        try:
            wu = wait_until if wait_until in ("commit", "domcontentloaded", "load", "networkidle") else "domcontentloaded"
            resp = await page.goto(url, wait_until=wu, timeout=timeout_ms)
            http_status = int(resp.status) if resp is not None else 0
            ctype = ""
            try:
                if resp is not None and resp.headers:
                    ctype = (resp.headers.get("content-type") or "")[:120]
            except Exception:
                ctype = ""
            await asyncio.sleep(min(1.5, wait_ms / 1000.0))
            if wait_for_selector:
                try:
                    await page.wait_for_selector(
                        wait_for_selector,
                        timeout=min(28000, max(5000, timeout_ms // 2)),
                        state="attached",
                    )
                except Exception:
                    pass
            await asyncio.sleep(max(0.0, min(wait_ms / 1000.0, 15.0) - 1.5))
            if scroll_page:
                for _ in range(4):
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await asyncio.sleep(0.9)
            html = await page.content()
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            hlen = len(html) if html else 0
            bbytes = len(html.encode("utf-8", errors="replace")) if html else 0
            cf = bool(html and is_cloudflare_interstitial_html(html))
            if html and len(html) >= 500:
                logger.debug(
                    "hub_playwright.fetch_done",
                    **_log_ex(
                        log_extra,
                        stage="playwright",
                        attempt=1,
                        http_status=http_status,
                        content_type=ctype,
                        html_len=hlen,
                        body_bytes=bbytes,
                        cf_interstitial=cf,
                        elapsed_ms=elapsed_ms,
                        error_code="",
                        url=url[:160],
                    ),
                )
                return html, ""
            ec = "body_too_small"
            logger.debug(
                "hub_playwright.fetch_done",
                **_log_ex(
                    log_extra,
                    stage="playwright",
                    attempt=1,
                    http_status=http_status,
                    content_type=ctype,
                    html_len=hlen,
                    body_bytes=bbytes,
                    cf_interstitial=cf,
                    elapsed_ms=elapsed_ms,
                    error_code=ec,
                    url=url[:160],
                ),
            )
            return None, ec
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            ec = f"pw:{type(exc).__name__}:{str(exc)[:80]}"
            logger.debug(
                "hub_playwright.fetch_done",
                **_log_ex(
                    log_extra,
                    stage="playwright",
                    attempt=1,
                    http_status=0,
                    content_type="",
                    html_len=0,
                    body_bytes=0,
                    cf_interstitial=False,
                    elapsed_ms=elapsed_ms,
                    error_code=ec[:120],
                    url=url[:160],
                ),
            )
            return None, ec
        finally:
            if block_heavy_assets:
                try:
                    await page.unroute("**/*")
                except Exception:
                    pass
            await page.close()

    async def stop(self) -> None:
        try:
            if self._context:
                await self._context.close()
        except Exception:
            pass
        self._context = None
        try:
            if self._browser:
                await self._browser.close()
        except Exception:
            pass
        self._browser = None
        try:
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass
        self._playwright = None
