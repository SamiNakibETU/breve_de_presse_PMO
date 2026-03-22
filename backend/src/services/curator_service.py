"""
Curateur MEMW v2 — LLM JSON + invariants (spec §5).
"""

from __future__ import annotations

import json
import time
import uuid
from collections import defaultdict
from typing import Any, Optional

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.article import Article
from src.models.cluster import TopicCluster
from src.models.edition import Edition, EditionTopic, EditionTopicArticle, LLMCallLog
from src.models.media_source import MediaSource
from src.services.llm_router import get_llm_router
from src.services.prompt_loader import load_prompt_bundle

logger = structlog.get_logger(__name__)


def _parse_json_loose(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text)


MAX_RECOMMENDED_ARTICLES_TOTAL = 40  # MEMW_PRODUCT_SPEC_v2 §5.4


def validate_curator_payload(
    data: dict[str, Any],
    *,
    valid_article_ids: set[uuid.UUID],
    target_topics_min: int,
    target_topics_max: int,
    corpus_country_codes: Optional[set[str]] = None,
) -> list[str]:
    errors: list[str] = []
    topics = data.get("topics")
    if not isinstance(topics, list):
        return ["topics doit être une liste"]
    n = len(topics)
    if n < target_topics_min or n > target_topics_max:
        errors.append(f"nombre de sujets {n} hors [{target_topics_min},{target_topics_max}]")
    seen_a: set[uuid.UUID] = set()
    all_recs: list[uuid.UUID] = []
    for i, t in enumerate(topics):
        if not isinstance(t, dict):
            errors.append(f"sujet {i}: objet attendu")
            continue
        rec = t.get("recommended_articles")
        if not isinstance(rec, list):
            errors.append(f"sujet {i}: recommended_articles manquant")
            continue
        if not (2 <= len(rec) <= 6):
            errors.append(
                f"sujet {i}: {len(rec)} articles recommandés, attendu entre 2 et 6",
            )
        for item in rec:
            if isinstance(item, dict) and "article_id" in item:
                try:
                    aid = uuid.UUID(str(item["article_id"]))
                except ValueError:
                    errors.append(f"sujet {i}: article_id invalide")
                    continue
                if aid not in valid_article_ids:
                    errors.append(f"article inconnu {aid}")
                if aid in seen_a:
                    errors.append(f"doublon inter-sujets {aid}")
                seen_a.add(aid)
                all_recs.append(aid)
    if len(all_recs) > MAX_RECOMMENDED_ARTICLES_TOTAL:
        errors.append(
            f"INVARIANT_6: {len(all_recs)} articles recommandés, max {MAX_RECOMMENDED_ARTICLES_TOTAL}",
        )

    # INVARIANT_5 — MEMW_PRODUCT_SPEC_v2 §5.4
    if corpus_country_codes:
        cc = {c.strip().upper() for c in corpus_country_codes if c and str(c).strip()}
        if len(cc) >= 1:
            topic_cc: set[str] = set()
            for t in topics:
                if not isinstance(t, dict):
                    continue
                cov = t.get("country_coverage")
                if isinstance(cov, dict):
                    for k in cov:
                        if k:
                            topic_cc.add(str(k).strip().upper())
            inter = topic_cc & cc
            ratio = len(inter) / len(cc)
            if ratio < 0.6:
                errors.append(
                    f"INVARIANT_5: couverture pays {ratio:.0%}, minimum 60 % du corpus "
                    f"({len(inter)}/{len(cc)} pays représentés dans les sujets)",
                )
    return errors


async def run_curator_for_edition(
    db: AsyncSession,
    edition_id: uuid.UUID,
    *,
    max_attempts: int = 3,
) -> dict[str, Any]:
    ed = await db.get(Edition, edition_id)
    if not ed:
        return {"status": "error", "detail": "edition not found"}

    stmt = (
        select(Article)
        .options(selectinload(Article.media_source))
        .where(Article.edition_id == edition_id)
        .where(Article.is_syndicated.is_(False))
        .where(Article.translation_confidence.isnot(None))
        .where(Article.translation_confidence >= 0.70)
    )
    res = await db.execute(stmt)
    articles = list(res.scalars().all())
    valid_ids = {a.id for a in articles}

    corpus_country_codes: set[str] = set()
    for a in articles:
        code = a.media_source.country_code if a.media_source else None
        if code:
            corpus_country_codes.add(str(code).strip().upper())

    by_cluster: dict[uuid.UUID, list[Article]] = defaultdict(list)
    noise_articles: list[Article] = []
    for a in articles:
        if a.cluster_id:
            by_cluster[a.cluster_id].append(a)
        else:
            noise_articles.append(a)

    clusters_payload: list[dict[str, Any]] = []
    for cid, arts in by_cluster.items():
        tc = await db.get(TopicCluster, cid)
        label = (tc.label if tc else None) or ""
        top = sorted(
            arts,
            key=lambda x: (x.translation_confidence or 0, len(x.summary_fr or "")),
            reverse=True,
        )[:5]
        clusters_payload.append(
            {
                "cluster_id": str(cid),
                "label": label,
                "article_count": len(arts),
                "articles": [
                    {
                        "id": str(x.id),
                        "media_name": x.media_source.name if x.media_source else "",
                        "country_code": x.media_source.country_code if x.media_source else "",
                        "title_fr": (x.title_fr or x.title_original or "")[:400],
                        "thesis": (x.thesis_summary_fr or "")[:500],
                        "summary_fr": (x.summary_fr or "")[:1200],
                    }
                    for x in top
                ],
            }
        )

    noise_sorted = sorted(
        noise_articles,
        key=lambda x: (x.translation_confidence or 0, len(x.summary_fr or "")),
        reverse=True,
    )[:80]
    noise_payload = [
        {
            "id": str(x.id),
            "media_name": x.media_source.name if x.media_source else "",
            "country_code": x.media_source.country_code if x.media_source else "",
            "title_fr": (x.title_fr or x.title_original or "")[:400],
            "thesis": (x.thesis_summary_fr or "")[:500],
            "summary_fr": (x.summary_fr or "")[:800],
        }
        for x in noise_sorted
    ]
    noise_articles_json = json.dumps(
        {
            "cluster_id": "noise",
            "label": "Divers / Non classés (HDBSCAN bruit)",
            "article_count": len(noise_articles),
            "articles": noise_payload,
        },
        ensure_ascii=False,
    )[:40_000]

    bundle = load_prompt_bundle("curator_v2")
    router = get_llm_router()
    clusters_json = json.dumps(clusters_payload, ensure_ascii=False)[:120_000]

    user = bundle.render_user(
        publish_date=str(ed.publish_date),
        window_start=ed.window_start.isoformat() if ed.window_start else "",
        window_end=ed.window_end.isoformat() if ed.window_end else "",
        target_topics_min=ed.target_topics_min,
        target_topics_max=ed.target_topics_max,
        clusters_json=clusters_json,
        noise_articles_json=noise_articles_json,
    )

    last_err: list[str] = []
    parsed: dict[str, Any] | None = None
    raw_out: str = ""
    schema = bundle.json_schema
    t0 = time.perf_counter()
    for attempt in range(max_attempts):
        try:
            u = user + (
                f"\n\nTentative {attempt + 1}/{max_attempts}."
                if attempt
                else ""
            )
            if schema and isinstance(schema, dict) and schema.get("properties"):
                parsed = await router.generate_anthropic_tool_json(
                    bundle.system_prompt,
                    u,
                    schema,
                    tool_name="curator_edition_output",
                    max_tokens=8192,
                    temperature=0.2,
                )
                raw_out = json.dumps(parsed, ensure_ascii=False)[:200_000]
            else:
                raw_out = await router.generate_anthropic_only(
                    bundle.system_prompt,
                    u,
                    max_tokens=8192,
                    temperature=0.2,
                )
                parsed = _parse_json_loose(raw_out)
            errs = validate_curator_payload(
                parsed,
                valid_article_ids=valid_ids,
                target_topics_min=ed.target_topics_min,
                target_topics_max=ed.target_topics_max,
                corpus_country_codes=corpus_country_codes,
            )
            if errs:
                last_err = errs
                user = user + "\n\nErreurs à corriger : " + "; ".join(errs[:8])
                continue
            last_err = []
            break
        except Exception as exc:
            last_err = [str(exc)[:300]]
            logger.warning("curator.parse_failed", attempt=attempt, error=str(exc)[:200])
    latency_ms = int((time.perf_counter() - t0) * 1000)

    log = LLMCallLog(
        edition_id=edition_id,
        prompt_id=bundle.prompt_id,
        prompt_version=bundle.version,
        model_used="anthropic",
        temperature=0.2,
        latency_ms=latency_ms,
        output_raw=(raw_out[:200_000] if raw_out else None),
        output_parsed=parsed,
        validation_errors={"errors": last_err} if last_err else None,
    )
    db.add(log)
    await db.flush()

    if not parsed or last_err:
        ed.status = "CURATION_FAILED"
        await db.commit()
        return {
            "status": "failed",
            "validation_errors": last_err,
            "llm_call_log_id": str(log.id),
        }

    await db.execute(delete(EditionTopic).where(EditionTopic.edition_id == edition_id))
    topics = parsed.get("topics") if isinstance(parsed, dict) else []
    if not isinstance(topics, list):
        topics = []
    for rank, t in enumerate(topics):
        if not isinstance(t, dict):
            continue
        et = EditionTopic(
            edition_id=edition_id,
            rank=rank,
            title_proposed=str(t.get("title") or "Sans titre")[:500],
            status="proposed",
            country_coverage=t.get("country_coverage") if isinstance(t.get("country_coverage"), dict) else None,
            angle_summary=str(t.get("dominant_angle") or "")[:2000],
            dominant_angle=str(t.get("dominant_angle") or "")[:2000],
            counter_angle=str(t.get("counter_angle") or "")[:2000],
            editorial_note=(str(t.get("editorial_note"))[:2000] if t.get("editorial_note") else None),
        )
        db.add(et)
        await db.flush()
        rec = t.get("recommended_articles") or []
        if isinstance(rec, list):
            for rnk, item in enumerate(rec):
                if not isinstance(item, dict):
                    continue
                try:
                    aid = uuid.UUID(str(item.get("article_id")))
                except (ValueError, TypeError):
                    continue
                db.add(
                    EditionTopicArticle(
                        edition_topic_id=et.id,
                        article_id=aid,
                        is_recommended=True,
                        is_selected=True,
                        rank_in_topic=rnk,
                    )
                )

    ed.status = "CURATING"
    ed.curator_run_id = log.id
    await db.commit()
    return {"status": "ok", "topics": len(topics), "llm_call_log_id": str(log.id)}


async def list_clusters_fallback_for_edition(
    db: AsyncSession,
    edition_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Clusters bruts étiquetés pour l’écran fallback (spec §7)."""
    stmt = (
        select(Article)
        .options(selectinload(Article.media_source))
        .where(Article.edition_id == edition_id)
        .where(Article.cluster_id.isnot(None))
    )
    res = await db.execute(stmt)
    arts = list(res.scalars().all())
    by_c: dict[uuid.UUID, list[Article]] = defaultdict(list)
    for a in arts:
        if a.cluster_id:
            by_c[a.cluster_id].append(a)
    out: list[dict[str, Any]] = []
    for cid, group in by_c.items():
        cl = await db.get(TopicCluster, cid)
        out.append(
            {
                "cluster_id": str(cid),
                "label": cl.label if cl else None,
                "article_count": len(group),
                "articles": [
                    {
                        "id": str(x.id),
                        "title": (x.title_fr or x.title_original or "")[:300],
                        "source": x.media_source.name if x.media_source else "",
                    }
                    for x in group[:40]
                ],
            }
        )
    return out
