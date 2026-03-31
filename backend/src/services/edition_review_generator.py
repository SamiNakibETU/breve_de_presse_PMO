"""
Génération de revue OLJ par EditionTopic — MEMW v2 §6, prompt generate_review_v2.yaml.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.config import get_settings
from src.models.article import Article
from src.models.edition import Edition, EditionTopic, EditionTopicArticle, LLMCallLog
from src.services.cost_estimate import estimate_llm_usage
from src.services.llm_route_hint import hint_olj_generation_primary
from src.services.provider_usage_ledger import append_provider_usage
from src.services.generator import COUNTRY_MAP, LANGUAGE_MAP
from src.services.llm_router import get_llm_router
from src.services.olj_pipeline_llm import olj_pipeline_completion
from src.services.prompt_loader import load_prompt_bundle


def _published_short(dt: datetime | None) -> str:
    if not dt:
        return "—"
    return dt.strftime("%d/%m/%Y")


def _country_label(code: str | None) -> str:
    if not code:
        return ""
    c = code.strip().upper()
    return COUNTRY_MAP.get(c, c)


def _lang_label(lang: str | None) -> str:
    if not lang:
        return ""
    return LANGUAGE_MAP.get(lang.lower(), lang)


def _build_articles_json(articles: list[Article]) -> str:
    """Payload JSON pour le prompt MEMW Prompt 4 (ordre conservé)."""
    out: list[dict[str, Any]] = []
    for a in articles:
        ms = a.media_source
        out.append(
            {
                "id": str(a.id),
                "media_name": ms.name if ms else "",
                "country_name": _country_label(ms.country_code if ms else None),
                "country_code": (ms.country_code if ms else "") or "",
                "author": a.author or "",
                "published_at_formatted": _published_short(a.published_at),
                "language": _lang_label(a.source_language),
                "thesis_sentence": (a.thesis_summary_fr or "")[:4000],
                "summary_fr": (a.summary_fr or "")[:8000],
                "translation_fr": ((a.content_translated_fr or "") or "")[:12000],
            }
        )
    return json.dumps(out, ensure_ascii=False)


async def _load_topic_articles(
    db: AsyncSession,
    edition_topic_id: uuid.UUID,
    *,
    override_article_ids: Optional[list[uuid.UUID]] = None,
) -> tuple[EditionTopic | None, list[Article]]:
    et = await db.get(EditionTopic, edition_topic_id)
    if not et:
        return None, []

    stmt = (
        select(EditionTopicArticle, Article)
        .join(Article, EditionTopicArticle.article_id == Article.id)
        .options(selectinload(Article.media_source))
        .where(EditionTopicArticle.edition_topic_id == edition_topic_id)
    )
    res = await db.execute(stmt)
    rows = list(res.all())

    def sort_key(
        pair: tuple[EditionTopicArticle, Article],
    ) -> tuple[int, str]:
        link, _art = pair
        r = link.rank_in_topic
        return (r if r is not None else 999, str(link.article_id))

    rows.sort(key=sort_key)

    if override_article_ids:
        wanted = {str(x) for x in override_article_ids}
        filtered = [
            (link, art)
            for link, art in rows
            if str(link.article_id) in wanted
        ]
        order = {str(i): idx for idx, i in enumerate(override_article_ids)}
        filtered.sort(
            key=lambda p: order.get(str(p[0].article_id), 999),
        )
        articles = [p[1] for p in filtered]
        return et, articles

    selected = [(link, art) for link, art in rows if link.is_selected]
    if not selected:
        selected = [(link, art) for link, art in rows if link.is_recommended]
    if not selected:
        selected = list(rows)

    articles = [p[1] for p in selected]
    return et, articles


async def generate_edition_topic_review(
    db: AsyncSession,
    edition_id: uuid.UUID,
    edition_topic_id: uuid.UUID,
    *,
    article_ids: Optional[list[uuid.UUID]] = None,
    instruction_suffix: Optional[str] = None,
) -> dict[str, Any]:
    """
    Génère le texte OLJ pour un sujet, persiste et journalise l'appel LLM.
    """
    ed = await db.get(Edition, edition_id)
    if not ed:
        return {"status": "error", "detail": "edition not found"}

    et = await db.get(EditionTopic, edition_topic_id)
    if not et or et.edition_id != edition_id:
        return {"status": "error", "detail": "topic not found"}

    et_loaded, articles = await _load_topic_articles(
        db,
        edition_topic_id,
        override_article_ids=article_ids,
    )
    if not et_loaded:
        return {"status": "error", "detail": "topic not found"}
    if len(articles) < 2:
        return {
            "status": "error",
            "detail": "Au moins 2 articles requis pour la génération (sélection ou recommandations).",
        }

    bundle = load_prompt_bundle("generate_review_v2")
    articles_json = _build_articles_json(articles)
    topic_title = (et.title_final or et.title_proposed)[:500]
    user = bundle.render_user(
        topic_title=topic_title,
        dominant_angle=(et.dominant_angle or "")[:4000],
        counter_angle=(et.counter_angle or "")[:4000],
        articles_json=articles_json,
    )
    suffix = (instruction_suffix or "").strip() or (
        (getattr(ed, "compose_instructions_fr", None) or "").strip()
    )
    if suffix:
        user = (
            f"{user}\n\n— Consignes additionnelles de la rédaction —\n{suffix[:8000]}"
        )

    router = get_llm_router()
    settings = get_settings()
    t0 = time.perf_counter()
    text = await olj_pipeline_completion(
        router,
        bundle.system_prompt,
        user,
        max_tokens=4096,
        temperature=0.4,
    )
    latency_ms = int((time.perf_counter() - t0) * 1000)

    et.generated_text = text.strip()
    if ed.status in ("CURATING", "SCHEDULED", "COLLECTING"):
        ed.status = "COMPOSING"

    if settings.olj_generation_anthropic_only:
        prov_log = "anthropic"
        model_id = settings.anthropic_generation_model
    else:
        prov_log, model_id = hint_olj_generation_primary()
    est_in, est_out, est_cost = estimate_llm_usage(
        provider=prov_log,
        model=model_id,
        input_text=bundle.system_prompt + user,
        output_text=text or "",
    )

    log = LLMCallLog(
        edition_id=edition_id,
        prompt_id=bundle.prompt_id,
        prompt_version=bundle.version,
        model_used=model_id,
        provider=prov_log,
        temperature=0.4,
        input_tokens=est_in,
        output_tokens=est_out,
        latency_ms=latency_ms,
        cost_usd=est_cost,
        output_raw=text[:200_000],
        output_parsed=None,
    )
    db.add(log)
    await append_provider_usage(
        db,
        kind="llm_completion",
        provider=prov_log,
        model=model_id,
        operation="generate_review_topic",
        status="ok",
        input_units=est_in,
        output_units=est_out,
        cost_usd_est=est_cost,
        duration_ms=latency_ms,
        edition_id=edition_id,
        edition_topic_id=edition_topic_id,
        meta_json={"prompt_id": bundle.prompt_id},
    )
    await db.commit()
    await db.refresh(et)

    return {
        "status": "ok",
        "edition_topic_id": str(et.id),
        "generated_text": et.generated_text,
        "llm_call_log_id": str(log.id),
        "article_count": len(articles),
    }


async def generate_all_edition_topics(
    db: AsyncSession,
    edition_id: uuid.UUID,
) -> dict[str, Any]:
    """Génère chaque sujet dans l'ordre, concatène dans editions.generated_text."""
    ed = await db.get(Edition, edition_id)
    if not ed:
        return {"status": "error", "detail": "edition not found"}

    stmt = (
        select(EditionTopic)
        .where(EditionTopic.edition_id == edition_id)
        .order_by(EditionTopic.rank.asc())
    )
    res = await db.execute(stmt)
    topics = list(res.scalars().all())
    if not topics:
        return {"status": "error", "detail": "no topics"}

    parts: list[str] = []
    errors: list[str] = []
    instr = (getattr(ed, "compose_instructions_fr", None) or "").strip()
    for t in topics:
        r = await generate_edition_topic_review(
            db,
            edition_id,
            t.id,
            instruction_suffix=instr if instr else None,
        )
        if r.get("status") != "ok":
            errors.append(f"{t.id}: {r.get('detail', r)}")
            continue
        if r.get("generated_text"):
            parts.append(str(r["generated_text"]))

    ed = await db.get(Edition, edition_id)
    if ed and parts:
        ed.generated_text = "\n\n\n".join(parts)
        await db.commit()
        await db.refresh(ed)

    if not parts and errors:
        out_status = "error"
    elif errors:
        out_status = "partial"
    else:
        out_status = "ok"

    return {
        "status": out_status,
        "topics_ok": len(parts),
        "topics_failed": errors,
        "generated_text": ed.generated_text if ed else None,
    }
