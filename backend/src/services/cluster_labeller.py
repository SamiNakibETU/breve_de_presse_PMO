"""
LLM-powered labelling of topic clusters.
"""

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.article import Article
from src.models.cluster import TopicCluster
from src.services.editorial_scope import is_out_of_scope_lifestyle
from src.services.llm_router import get_llm_router

logger = structlog.get_logger()

# Contexte revue de presse régionale : évite les labels « cuisine / voyage » hors-sujet.
LABEL_PROMPT = """Tu rédiges des rubriques pour une **revue de presse Moyen-Orient** (géopolitique, sécurité, société, économie locale).

Voici des extraits d'articles regroupés automatiquement (titres + débuts de résumé FR quand disponibles) :

{blocks}

Consignes :
- Si le fil commun est clairement **la région MENA / ses voisinages directs** (Iran, Israël, Palestine, Liban, Syrie, Irak, Golfe, Turquie, Égypte, conflits, diplomatie, énergie, crises humanitaires) : un label **court et précis** (6 à 14 mots), factuel, en français, **sans verbe conjugué** (style manchette).
- Si le groupe mélange surtout des **hors-sujets** (lifestyle, sport pur, cuisine, voyages sans angle régional, tech générique sans lien Moyen-Orient) avec peu ou pas de lien avec cette mission : réponds **exactement** : `Hétérogène — revue de presse à resynchroniser`
- Si le thème est **trop vague** (« conflit au Moyen-Orient ») mais pertinent : affine avec l'acteur ou l'enjeu principal visible dans les extraits (ex. « Tensions Iran — États-Unis et sécurité du Golfe »).

Réponds **uniquement** avec le label, une seule ligne, sans guillemets."""


def _snippet(text: str | None, max_len: int = 180) -> str:
    if not text:
        return ""
    t = " ".join(text.split())
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rsplit(" ", 1)[0] + "…"


async def label_clusters(db: AsyncSession) -> int:
    router = get_llm_router()

    stmt = (
        select(TopicCluster)
        .where(TopicCluster.is_active == True)
        .where(TopicCluster.label.is_(None))
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
            .limit(12)
        )
        articles_result = await db.execute(articles_stmt)
        articles = articles_result.scalars().all()

        blocks: list[str] = []
        for a in articles:
            title = (a.title_fr or a.title_original or "").strip()
            if not title:
                continue
            summ = _snippet(a.summary_fr)
            if summ:
                blocks.append(f"- {title}\n  → {summ}")
            else:
                blocks.append(f"- {title}")

        if not blocks:
            continue

        try:
            label = await router.generate(
                system=(
                    "Tu es rédacteur en chef adjoint pour une revue de presse "
                    "spécialisée Proche & Moyen-Orient. Tu refuses les titres fourre-tout."
                ),
                prompt=LABEL_PROMPT.format(blocks="\n".join(blocks)),
            )
            cleaned = label.strip().strip('"').strip("«").strip("»").strip()[:300]
            if is_out_of_scope_lifestyle(cleaned):
                cleaned = (
                    "Hors périmètre revue (lifestyle / voyage) — exclure de la veille"
                )
            cluster.label = cleaned
            labeled += 1
        except Exception as e:
            logger.warning(
                "cluster_label_failed",
                cluster_id=str(cluster.id),
                error=str(e),
            )

    await db.commit()
    logger.info("clusters_labeled", count=labeled)
    return labeled
