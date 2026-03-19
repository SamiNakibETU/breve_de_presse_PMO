"""
Named Entity upsert service.
Uses PostgreSQL ON CONFLICT for safe concurrent access.
"""

import uuid

import structlog
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.entity import ArticleEntity, Entity

logger = structlog.get_logger(__name__)


async def upsert_entities(
    db: AsyncSession,
    article_id: uuid.UUID,
    entities_raw: list[dict],
) -> int:
    """
    Upsert entities and link them to the article using ON CONFLICT
    to avoid deadlocks and duplicate-key errors under concurrency.
    """
    count = 0
    valid_types = frozenset(
        {"PERSON", "ORG", "GPE", "EVENT", "WEAPON_SYSTEM", "TREATY", "OTHER"}
    )

    for raw in entities_raw:
        name = raw.get("name", "").strip()
        entity_type = raw.get("type", "OTHER").upper()
        name_fr = raw.get("name_fr", "").strip() or name

        if not name:
            continue

        if entity_type not in valid_types:
            entity_type = "OTHER"

        stmt = (
            pg_insert(Entity)
            .values(
                id=uuid.uuid4(),
                name=name,
                name_fr=name_fr,
                entity_type=entity_type,
                mention_count=1,
            )
            .on_conflict_do_update(
                constraint="uq_entity_name_type",
                set_={
                    "mention_count": Entity.mention_count + 1,
                    "name_fr": text(
                        "COALESCE(NULLIF(entities.name_fr, ''), EXCLUDED.name_fr)"
                    ),
                },
            )
            .returning(Entity.id)
        )

        result = await db.execute(stmt)
        entity_id = result.scalar_one()

        link_stmt = (
            pg_insert(ArticleEntity)
            .values(
                article_id=article_id,
                entity_id=entity_id,
                context=raw.get("context"),
            )
            .on_conflict_do_nothing()
        )
        await db.execute(link_stmt)

        count += 1

    return count
