"""Journal unifié des usages facturables (LLM, embeddings) pour le dashboard coûts."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base


class ProviderUsageEvent(Base):
    """Une unité d’usage (appel API payant) — agrégation dashboard."""

    __tablename__ = "provider_usage_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    kind: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # llm_completion | embedding
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    operation: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ok")
    input_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd_est: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    edition_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editions.id", ondelete="SET NULL"),
        nullable=True,
    )
    article_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("articles.id", ondelete="SET NULL"),
        nullable=True,
    )
    edition_topic_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("edition_topics.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
