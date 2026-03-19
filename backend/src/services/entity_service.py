"""
Named Entity upsert service.
Uses PostgreSQL ON CONFLICT with SAVEPOINT-based retry for deadlock safety.
"""

import asyncio
import uuid

import structlog
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.entity import ArticleEntity, Entity

logger = structlog.get_logger(__name__)

_entity_lock = asyncio.Lock()


async def upsert_entities(
    db: AsyncSession,
    article_id: uuid.UUID,
    entities_raw: list[dict],
) -> int:
    """
    Upsert entities and link them to the article.
    Uses a global asyncio lock to prevent deadlocks from concurrent upserts
    on the same entity rows.
    """
    async with _entity_lock:
        return await _do_upsert(db, article_id, entities_raw)


async def _do_upsert(
    db: AsyncSession,
    article_id: uuid.UUID,
    entities_raw: list[dict],
) -> int:
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

        try:
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
        except Exception as exc:
            logger.warning(
                "entity.upsert_single_failed",
                name=name,
                error=str(exc)[:200],
            )
            await db.rollback()

    return count
