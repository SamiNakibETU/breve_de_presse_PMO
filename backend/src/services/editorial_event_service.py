"""Résolution d’événements éditoriaux à partir de l’extraction LLM (MVP)."""

from __future__ import annotations

import re
import uuid
from typing import Any, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.editorial_event import EditorialEvent

logger = structlog.get_logger(__name__)


def _slugify(label: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ\s-]", "", label)
    s = re.sub(r"\s+", "-", s.strip().lower())
    return (s[:180] or "event")[:180]


async def resolve_or_create_event_for_article(
    db: AsyncSession,
    *,
    extraction: dict[str, Any] | None,
    min_completeness: float = 0.35,
) -> uuid.UUID | None:
    """
    Si extraction contient un libellé d’événement et une complétude suffisante,
    rattache à un EditorialEvent existant (slug / libellé proche) ou crée un brouillon.
    """
    if not extraction or not isinstance(extraction, dict):
        return None
    completeness = extraction.get("completeness_0_1")
    try:
        comp_f = float(completeness)
    except (TypeError, ValueError):
        comp_f = 0.0
    if comp_f < min_completeness:
        return None

    label = extraction.get("canonical_event_label_fr") or extraction.get("what")
    if not isinstance(label, str) or len(label.strip()) < 4:
        return None
    label = label.strip()[:500]
    slug = _slugify(label)

    stmt = select(EditorialEvent).where(EditorialEvent.slug == slug)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        return existing.id

    stmt2 = select(EditorialEvent).where(
        EditorialEvent.canonical_label_fr.ilike(label[:200]),
    )
    res2 = await db.execute(stmt2)
    existing2 = res2.scalar_one_or_none()
    if existing2:
        return existing2.id

    ev = EditorialEvent(
        canonical_label_fr=label,
        slug=slug,
        metadata_json={
            "who": extraction.get("who"),
            "what": extraction.get("what"),
            "where": extraction.get("where"),
            "when": extraction.get("when"),
            "completeness_0_1": comp_f,
        },
        status="draft",
    )
    db.add(ev)
    await db.flush()
    logger.info("editorial_event.created_draft", slug=slug, id=str(ev.id))
    return ev.id
