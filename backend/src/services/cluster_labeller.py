"""
LLM-powered labelling of topic clusters.
"""

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.article import Article
from src.models.cluster import TopicCluster
from src.services.llm_router import get_llm_router

logger = structlog.get_logger()

LABEL_PROMPT = """Tu es un éditeur de presse. Voici les titres de plusieurs articles sur le même sujet :

{titles}

Génère un label de 5 à 10 mots maximum qui décrit le thème commun de ces articles.
Le label doit être en français, factuel et descriptif (pas de verbe conjugué).
Réponds UNIQUEMENT avec le label, rien d'autre."""


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
            .limit(5)
        )
        articles_result = await db.execute(articles_stmt)
        articles = articles_result.scalars().all()

        titles = "\n".join(
            f"- {a.title_fr or a.title_original}"
            for a in articles
            if a.title_fr or a.title_original
        )

        if not titles:
            continue

        try:
            label = await router.generate(
                system="Tu es un éditeur de presse spécialisé Moyen-Orient.",
                prompt=LABEL_PROMPT.format(titles=titles),
            )
            cluster.label = (
                label.strip().strip('"').strip("«").strip("»").strip()[:300]
            )
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
