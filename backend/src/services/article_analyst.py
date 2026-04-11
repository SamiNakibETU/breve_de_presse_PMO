"""
Analyse experte post-traduction (MEMW plan v2) — bullets, thèse, faits vs opinion.
"""

from __future__ import annotations

import json
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.services.article_analysis_priority import EDITORIAL_TYPES_SQL_TUPLE

logger = structlog.get_logger(__name__)

ANALYSIS_VERSION = "article_analysis_v1"


def _snippet(body: str | None, max_chars: int = 24000) -> str:
    if not body:
        return ""
    b = body.strip()
    if len(b) <= max_chars:
        return b
    return b[: max_chars - 1] + "…"


def _analysis_candidate_conditions(
    *,
    edition_id: uuid.UUID | None,
    force: bool,
) -> list[Any]:
    """Prédicats communs COUNT et SELECT (hors ``out_of_scope`` : non pertinents)."""
    conds: list[Any] = [
        Article.summary_fr.isnot(None),
        Article.status.in_(("translated", "needs_review", "formatted")),
        or_(
            Article.relevance_band.is_(None),
            Article.relevance_band == "",
            Article.relevance_band.in_(("high", "medium", "low")),
        ),
    ]
    if not force:
        conds.append(Article.analyzed_at.is_(None))
    if edition_id is not None:
        conds.append(Article.edition_id == edition_id)
    return conds


def _band_order_case():
    return case(
        (Article.relevance_band == "high", 0),
        (Article.relevance_band == "medium", 1),
        (Article.relevance_band == "low", 2),
        else_=3,
    )


def _editorial_type_order_case():
    lowered = func.lower(func.coalesce(Article.article_type, ""))
    return case((lowered.in_(EDITORIAL_TYPES_SQL_TUPLE), 0), else_=1)


async def analyze_article(
    db: AsyncSession,
    article_id: uuid.UUID,
) -> dict[str, Any]:
    """Analyse un article et persiste les colonnes d'analyse."""
    s = get_settings()
    if not s.article_analysis_enabled:
        return {"skipped": True, "reason": "article_analysis_disabled"}

    res = await db.execute(
        select(Article)
        .options(selectinload(Article.media_source))
        .where(Article.id == article_id)
    )
    a = res.scalar_one_or_none()
    if not a:
        return {"error": "not_found"}
    if not (a.summary_fr or "").strip():
        return {"skipped": True, "reason": "no_summary_fr"}
    band = (a.relevance_band or "").strip().lower()
    if band == "out_of_scope":
        return {"skipped": True, "reason": "out_of_scope"}

    from src.services.prompt_loader import load_prompt_bundle

    bundle = load_prompt_bundle("article_analysis_v1")
    schema = bundle.json_schema
    if not schema or not isinstance(schema, dict):
        raise RuntimeError("article_analysis_v1: json_schema manquant")

    ms = a.media_source
    body_full = _snippet(a.content_translated_fr or a.content_original)
    user = bundle.render_user(
        title_fr=(a.title_fr or a.title_original or "")[:800],
        media_name=ms.name if ms else "",
        country_code=ms.country_code if ms else "",
        author=(a.author or "")[:300],
        article_type=(a.article_type or "")[:80],
        summary_fr=(a.summary_fr or "")[:4000],
        thesis_summary_fr=(a.thesis_summary_fr or "")[:2000],
        content_snippet=body_full,
        content_full_fr=body_full,
    )

    from src.services.cost_estimate import estimate_llm_usage
    from src.services.llm_router import Provider, get_llm_router
    from src.services.provider_usage_ledger import append_provider_usage

    router = get_llm_router()
    model_cfg = (s.article_analysis_model or "").strip()
    is_groq = model_cfg.startswith("llama") or model_cfg.startswith("meta-llama") or model_cfg.startswith("qwen") or model_cfg.startswith("gemma") or model_cfg.startswith("mixtral") or "/" in model_cfg
    is_anthropic = model_cfg.startswith("claude") or not model_cfg

    if is_anthropic:
        provider = Provider.ANTHROPIC
        model = model_cfg or s.anthropic_translation_model
    else:
        provider = Provider.GROQ
        model = model_cfg

    t0 = time.perf_counter()
    try:
        data = await router.generate_structured_json(
            bundle.system_prompt,
            user,
            schema,
            provider=provider,
            model=model,
            max_tokens=s.article_analysis_max_tokens,
            temperature=0.1,
        )
        out_text = json.dumps(data, ensure_ascii=False)
    except Exception as exc:
        logger.warning("article_analyst.failed", article_id=str(article_id), error=str(exc)[:200])
        return {"error": "llm_failed", "detail": str(exc)[:200]}

    dur_ms = int((time.perf_counter() - t0) * 1000)
    inp_t, out_t, cst = estimate_llm_usage(
        provider=provider.value,
        model=model,
        input_text=bundle.system_prompt + user,
        output_text=out_text,
    )
    await append_provider_usage(
        db,
        kind="llm_completion",
        provider=provider.value,
        model=model,
        operation="article_analysis",
        status="ok",
        input_units=inp_t,
        output_units=out_t,
        cost_usd_est=cst,
        duration_ms=dur_ms,
        article_id=article_id,
        meta_json={"analysis_version": ANALYSIS_VERSION},
    )

    bullets = data.get("analysis_bullets")
    if not isinstance(bullets, list):
        bullets = []
    a.analysis_bullets_fr = [str(x) for x in bullets[:5]]
    a.author_thesis_explicit_fr = str(data.get("author_thesis") or "")[:8000] or None
    a.factual_context_fr = str(data.get("factual_context") or "")[:8000] or None
    a.analysis_tone = str(data.get("analysis_tone") or "")[:32] or None
    a.fact_opinion_quality = str(data.get("fact_opinion_separation_quality") or "")[:32] or None
    a.analysis_version = ANALYSIS_VERSION
    a.analyzed_at = datetime.now(timezone.utc)
    await db.commit()
    return {
        "article_id": str(article_id),
        "ok": True,
        "analysis_tone": a.analysis_tone,
    }


def _disabled_pipeline_payload() -> dict[str, Any]:
    return {
        "skipped": True,
        "reason": "article_analysis_disabled",
        "analyzed": 0,
        "errors": 0,
        "skipped_articles": 0,
        "error_samples": [],
        "eligible_total": 0,
        "selected_for_batch": 0,
        "deferred_due_to_batch_limit": 0,
        "batch_limit": 0,
        "skipped_by_reason": {},
        "errors_by_type": {},
    }


async def run_article_analysis_pipeline(
    *,
    edition_id: uuid.UUID | None = None,
    limit: int | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Articles traduits pertinents ; priorité bande × type éditorial ; si ``force``, ré-analyse."""
    s = get_settings()
    if not s.article_analysis_enabled:
        return _disabled_pipeline_payload()

    factory = get_session_factory()
    async with factory() as db:
        lim = limit if limit is not None else s.article_analysis_batch_limit
        conds = _analysis_candidate_conditions(edition_id=edition_id, force=force)
        predicate = and_(*conds)

        count_stmt = select(func.count()).select_from(Article).where(predicate)
        eligible_total = int((await db.execute(count_stmt)).scalar_one() or 0)

        band_ord = _band_order_case()
        type_ord = _editorial_type_order_case()
        stmt = (
            select(Article)
            .where(predicate)
            .order_by(
                band_ord.asc(),
                type_ord.asc(),
                Article.collected_at.desc(),
            )
            .limit(lim)
        )

        logger.info(
            "article_analysis.pipeline_start",
            edition_id=str(edition_id) if edition_id else None,
            force=force,
            limit=lim,
            eligible_total=eligible_total,
        )

        res = await db.execute(stmt)
        rows = list(res.scalars().all())
        selected_for_batch = len(rows)
        deferred_due_to_batch_limit = max(0, eligible_total - lim)

        logger.info(
            "article_analysis.candidates_loaded",
            candidates=selected_for_batch,
            edition_id=str(edition_id) if edition_id else None,
        )
        analyzed = 0
        errors = 0
        skipped_articles = 0
        error_samples: list[dict[str, Any]] = []
        skipped_by_reason: dict[str, int] = defaultdict(int)
        errors_by_type: dict[str, int] = defaultdict(int)
        for a in rows:
            r = await analyze_article(db, a.id)
            if r.get("ok"):
                analyzed += 1
            elif r.get("skipped"):
                skipped_articles += 1
                reason = str(r.get("reason") or "unknown_skip")
                skipped_by_reason[reason] += 1
            else:
                errors += 1
                err_key = str(r.get("error") or "unknown_error")
                errors_by_type[err_key] += 1
                if len(error_samples) < 5:
                    error_samples.append(
                        {
                            "article_id": str(a.id),
                            "error": r.get("error"),
                            "detail": (r.get("detail") or "")[:400],
                        }
                    )
        return {
            "candidates": selected_for_batch,
            "selected_for_batch": selected_for_batch,
            "eligible_total": eligible_total,
            "deferred_due_to_batch_limit": deferred_due_to_batch_limit,
            "batch_limit": lim,
            "analyzed": analyzed,
            "errors": errors,
            "skipped_articles": skipped_articles,
            "skipped_by_reason": dict(skipped_by_reason),
            "errors_by_type": dict(errors_by_type),
            "force": force,
            "error_samples": error_samples,
        }
