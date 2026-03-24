"""
Gate LLM léger après filtres heuristiques (MEMW §2.1.4) pour titres / cas ambigus.
"""

from __future__ import annotations

import json
import re
import time

import structlog

from src.config import get_settings
from src.services.cost_estimate import estimate_llm_usage
from src.services.llm_route_hint import hint_small_json_classify_primary
from src.services.llm_router import get_llm_router
from src.services.provider_usage_ledger import append_provider_usage_commit

logger = structlog.get_logger(__name__)

_SYSTEM = """Tu es un éditeur pour une revue de presse géopolitique Moyen-Orient.
Décide si l’entrée RSS mérite d’être ingérée (conflits, diplomatie régionale, sécurité,
énergie stratégique, puissances régionales), en excluant lifestyle, sport pur, voyages.

Réponds UNIQUEMENT un JSON : {"pertinent": true} ou {"pertinent": false}."""


def _parse_pertinent(text: str) -> bool:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```\w*\n?", "", t)
        t = re.sub(r"\n?```$", "", t).strip()
    try:
        data = json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\{[^{}]*\}", t, re.DOTALL)
        if not m:
            raise
        data = json.loads(m.group())
    v = data.get("pertinent")
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.lower() in ("true", "1", "yes", "oui")
    return False


async def confirm_geopolitical_relevance(title: str, summary: str) -> bool:
    """
    True = ingérer. En cas d’erreur API, on accepte (ne pas bloquer la collecte).
    """
    s = get_settings()
    if not s.ingestion_llm_gate_enabled:
        return True
    try:
        router = get_llm_router()
    except RuntimeError:
        logger.warning("ingestion_gate.no_llm_router_skip")
        return True

    cap = s.ingestion_llm_gate_summary_max_chars
    payload = json.dumps(
        {"titre": (title or "")[:500], "resume_rss": (summary or "")[:cap]},
        ensure_ascii=False,
    )
    try:
        t0 = time.perf_counter()
        raw = await router.small_json_classify(_SYSTEM, payload)
        dur_ms = int((time.perf_counter() - t0) * 1000)
        prov, mod = hint_small_json_classify_primary()
        inp_t, out_t, cst = estimate_llm_usage(
            provider=prov,
            model=mod,
            input_text=_SYSTEM + payload,
            output_text=raw or "",
        )
        await append_provider_usage_commit(
            kind="llm_completion",
            provider=prov,
            model=mod,
            operation="ingestion_gate",
            status="ok",
            input_units=inp_t,
            output_units=out_t,
            cost_usd_est=cst,
            duration_ms=dur_ms,
        )
        ok = _parse_pertinent(raw)
        logger.info("ingestion_gate.result", pertinent=ok, title_snip=(title or "")[:60])
        return ok
    except Exception as exc:
        logger.warning(
            "ingestion_gate.fallback_accept",
            error=str(exc)[:200],
        )
        return True
