"""
LLM-powered labelling of topic clusters.
"""

import structlog
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.article import Article
from src.models.cluster import TopicCluster
from src.services.editorial_scope import is_out_of_scope_lifestyle
from src.services.llm_router import get_llm_router
from src.services.prompt_loader import load_prompt_bundle

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


async def label_clusters(db: AsyncSession) -> int:
    router = get_llm_router()

    stmt = (
        select(TopicCluster)
        .where(TopicCluster.is_active == True)
        .where(
            or_(
                TopicCluster.label.is_(None),
                func.trim(func.coalesce(TopicCluster.label, "")) == "",
            )
        )
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
                if schema and isinstance(schema, dict) and schema.get("properties"):
                    data = await router.generate_anthropic_tool_json(
                        bundle.system_prompt,
                        user,
                        schema,
                        tool_name="cluster_label",
                        max_tokens=600,
                        temperature=0.2,
                    )
                    cleaned = str(data.get("label", "")).strip()[:300]
                else:
                    raw = await router.generate_anthropic_only(
                        bundle.system_prompt,
                        user,
                        max_tokens=600,
                        temperature=0.2,
                    )
                    cleaned = raw.strip()
                    try:
                        import json

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
