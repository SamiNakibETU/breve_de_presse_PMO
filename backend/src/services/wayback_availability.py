"""
API publique archive.org « wayback/available » : indique si une capture existe (diagnostic / recherche).

Ne remplace pas le fetch direct ; utile pour documenter les échecs dans les rapports de validation.
"""

from __future__ import annotations

import asyncio
from typing import Any

import aiohttp

WAYBACK_AVAILABLE = "https://archive.org/wayback/available"


def parse_wayback_availability_json(data: object) -> dict[str, Any]:
    """Interprète le JSON renvoyé par l’API (tests sans réseau)."""
    out: dict[str, Any] = {
        "checked": True,
        "closest_url": None,
        "timestamp": None,
        "status": None,
        "error": None,
    }
    if not isinstance(data, dict):
        out["error"] = "invalid_json_shape"
        return out
    snaps = data.get("archived_snapshots") or {}
    closest = snaps.get("closest") if isinstance(snaps, dict) else None
    if not isinstance(closest, dict):
        return out
    if closest.get("available") is True or str(closest.get("status", "")).startswith("2"):
        out["closest_url"] = closest.get("url")
        out["timestamp"] = closest.get("timestamp")
        out["status"] = closest.get("status")
    return out


async def fetch_wayback_availability(
    url: str,
    *,
    timeout_s: float = 12.0,
) -> dict[str, Any]:
    """
    Interroge https://archive.org/wayback/available?url=...
    Retourne un dict sérialisable (closest_url / timestamp si capture connue).
    """
    base: dict[str, Any] = {
        "checked": True,
        "closest_url": None,
        "timestamp": None,
        "status": None,
        "error": None,
    }
    try:
        timeout = aiohttp.ClientTimeout(total=timeout_s, connect=8)
        async with aiohttp.ClientSession() as session:
            async with session.get(
                WAYBACK_AVAILABLE,
                params={"url": url},
                timeout=timeout,
                headers={"User-Agent": "OLJ-PressReview/1.0 (wayback-check; editorial)"},
            ) as resp:
                if resp.status != 200:
                    base["error"] = f"http_{resp.status}"
                    return base
                data = await resp.json()
    except (asyncio.TimeoutError, aiohttp.ClientError):
        base["error"] = "timeout_or_network"
        return base
    except Exception as exc:
        base["error"] = f"{type(exc).__name__}:{str(exc)[:80]}"
        return base

    parsed = parse_wayback_availability_json(data)
    parsed["error"] = base.get("error")
    return parsed
