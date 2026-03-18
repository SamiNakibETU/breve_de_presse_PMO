"""
Named Entity upsert service.
Handles deduplication on (name, entity_type) and article linking.
"""

import uuid

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.entity import ArticleEntity, Entity

logger = structlog.get_logger(__name__)


async def upsert_entities(
    db: AsyncSession,
    article_id: uuid.UUID,
    entities_raw: list[dict],
) -> int:
    """
    Upsert entities from LLM output and link them to the article.
    Returns count of entities processed.
    """
    count = 0

    for raw in entities_raw:
        name = raw.get("name", "").strip()
        entity_type = raw.get("type", "OTHER").upper()
        name_fr = raw.get("name_fr", "").strip() or name

        if not name:
            continue

        valid_types = {"PERSON", "ORG", "GPE", "EVENT", "WEAPON_SYSTEM", "TREATY", "OTHER"}
        if entity_type not in valid_types:
            entity_type = "OTHER"

        result = await db.execute(
            select(Entity).where(Entity.name == name, Entity.entity_type == entity_type)
        )
        entity = result.scalar_one_or_none()

        if entity:
            entity.mention_count += 1
            if name_fr and not entity.name_fr:
                entity.name_fr = name_fr
        else:
            entity = Entity(
                name=name,
                name_fr=name_fr,
                entity_type=entity_type,
            )
            db.add(entity)
            await db.flush()

        existing_link = await db.execute(
            select(ArticleEntity).where(
                ArticleEntity.article_id == article_id,
                ArticleEntity.entity_id == entity.id,
            )
        )
        if not existing_link.scalar_one_or_none():
            db.add(
                ArticleEntity(
                    article_id=article_id,
                    entity_id=entity.id,
                    context=raw.get("context"),
                )
            )

        count += 1

    return count
