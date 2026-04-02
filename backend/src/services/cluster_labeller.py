"""
LLM-powered labelling of topic clusters.
"""

import json
import time
import uuid

import structlog
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.models.article import Article
from src.models.cluster import TopicCluster
from src.services.cost_estimate import estimate_llm_usage
from src.services.editorial_scope import is_out_of_scope_lifestyle
from src.services.llm_route_hint import hint_anthropic_generation, hint_olj_generation_primary
from src.services.llm_router import get_llm_router
from src.services.olj_pipeline_llm import olj_pipeline_completion
from src.services.prompt_loader import load_prompt_bundle
from src.services.provider_usage_ledger import append_provider_usage

logger = structlog.get_logger()


def _snippet(text: str | None, max_len: int = 180) -> str:
    if not text:
        return ""
    t = " ".join(text.split())
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rsplit(" ", 1)[0] + "…"


def _fallback_label_from_articles(articles: list[Article]) -> str:
    """Libellé de secours si le LLM renvoie vide ou si aucun bloc prompt n’est construit."""
    for a in articles:
        t = (a.title_fr or a.title_original or "").strip()
        if t:
            return t[:300]
    for a in articles:
        s = _snippet(a.summary_fr, max_len=220)
        if s:
            return s[:300]
    return "Textes regroupés (titres manquants)"


def _normalize_stored_cluster_label(
    current: str | None,
    articles: list[Article],
) -> str:
    """Après LLM / exception : garantit un libellé non vide en base."""
    fin = (current or "").strip()
    if fin:
        return fin[:300]
    return _fallback_label_from_articles(articles)


async def label_clusters(
    db: AsyncSession,
    *,
    edition_id: uuid.UUID | None = None,
) -> int:
    router = get_llm_router()

    label_empty = or_(
        TopicCluster.label.is_(None),
        func.trim(func.coalesce(TopicCluster.label, "")) == "",
    )
    if edition_id is not None:
        cluster_ids_subq = (
            select(Article.cluster_id)
            .where(
                Article.edition_id == edition_id,
                Article.cluster_id.isnot(None),
            )
            .distinct()
        )
        stmt = (
            select(TopicCluster)
            .where(TopicCluster.is_active == True)
            .where(label_empty)
            .where(TopicCluster.id.in_(cluster_ids_subq))
        )
    else:
        stmt = (
            select(TopicCluster)
            .where(TopicCluster.is_active == True)
            .where(label_empty)
        )
    result = await db.execute(stmt)
    clusters = result.scalars().all()

    labeled = 0
    for cluster in clusters:
        articles_stmt = (
            select(Article)
            .where(Article.cluster_id == cluster.id)
            .order_by(
                Article.translation_confidence.desc().nullslast(),
                Article.published_at.desc().nullslast(),
            )
            .limit(48)
        )
        articles_result = await db.execute(articles_stmt)
        articles = list(articles_result.scalars().all())

        # Prioriser les articles avec titre pour le prompt (évite un prompt vide si les N premiers n’ont pas de titre)
        with_title = [a for a in articles if (a.title_fr or a.title_original or "").strip()]
        without_title = [a for a in articles if a not in with_title]
        ordered = with_title + without_title

        blocks: list[str] = []
        for a in ordered[:24]:
            title = (a.title_fr or a.title_original or "").strip()
            if not title:
                continue
            summ = _snippet(a.summary_fr)
            if summ:
                blocks.append(f"- {title}\n  → {summ}")
            else:
                blocks.append(f"- {title}")

        fallback = _fallback_label_from_articles(articles)

        try:
            if not blocks:
                cluster.label = _normalize_stored_cluster_label(fallback, articles)
                labeled += 1
            else:
                bundle = load_prompt_bundle("cluster_label_v2")
                user = bundle.render_user(blocks="\n".join(blocks))
                schema = bundle.json_schema
                t0 = time.perf_counter()
                if schema and isinstance(schema, dict) and schema.get("properties"):
                    data = await router.generate_anthropic_tool_json(
                        bundle.system_prompt,
                        user,
                        schema,
                        tool_name="cluster_label",
                        max_tokens=600,
                        temperature=0.2,
                    )
                    out_text = json.dumps(data, ensure_ascii=False)
                    cleaned = str(data.get("label", "")).strip()[:300]
                else:
                    raw = await olj_pipeline_completion(
                        router,
                        bundle.system_prompt,
                        user,
                        max_tokens=600,
                        temperature=0.2,
                    )
                    out_text = raw or ""
                    cleaned = raw.strip()
                    try:
                        cleaned = (
                            cleaned.strip()
                            .removeprefix("```json")
                            .removesuffix("```")
                            .strip()
                        )
                        data = json.loads(cleaned)
                        if isinstance(data, dict) and data.get("label"):
                            cleaned = str(data["label"]).strip()[:300]
                        else:
                            cleaned = cleaned[:300]
                    except Exception:
                        cleaned = cleaned[:300]
                dur_ms = int((time.perf_counter() - t0) * 1000)
                used_tool = bool(
                    schema and isinstance(schema, dict) and schema.get("properties"),
                )
                prov, mod = (
                    hint_anthropic_generation()
                    if used_tool or get_settings().olj_generation_anthropic_only
                    else hint_olj_generation_primary()
                )
                inp_t, out_t, cst = estimate_llm_usage(
                    provider=prov,
                    model=mod,
                    input_text=bundle.system_prompt + user,
                    output_text=out_text,
                )
                await append_provider_usage(
                    db,
                    kind="llm_completion",
                    provider=prov,
                    model=mod,
                    operation="cluster_label",
                    status="ok",
                    input_units=inp_t,
                    output_units=out_t,
                    cost_usd_est=cst,
                    duration_ms=dur_ms,
                    meta_json={
                        "cluster_id": str(cluster.id),
                        "tool_json": bool(
                            schema
                            and isinstance(schema, dict)
                            and schema.get("properties")
                        ),
                    },
                )
                if not cleaned:
                    cleaned = fallback
                if is_out_of_scope_lifestyle(cleaned):
                    cleaned = (
                        "Hors périmètre revue (lifestyle / voyage) — exclure de la veille"
                    )
                cluster.label = _normalize_stored_cluster_label(cleaned, articles)
                labeled += 1
        except Exception as e:
            logger.warning(
                "cluster_label_failed",
                cluster_id=str(cluster.id),
                error=str(e),
            )
            try:
                cluster.label = _normalize_stored_cluster_label(fallback, articles)
                labeled += 1
            except Exception:
                pass
        else:
            # Branche « if not blocks » a déjà normalisé ; sécurité si logique évolue
            if not (cluster.label or "").strip():
                cluster.label = _normalize_stored_cluster_label(cluster.label, articles)

    await db.commit()
    logger.info("clusters_labeled", count=labeled)
    return labeled
