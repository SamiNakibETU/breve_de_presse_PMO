"""MEMW v2 — Édition (objet central) et sujets éditoriaux."""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import ARRAY, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base

if TYPE_CHECKING:
    from src.models.article import Article


class Edition(Base):
    """Intention de publication bornée dans le temps (MENA revue, spec §2)."""

    __tablename__ = "editions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    publish_date: Mapped[date] = mapped_column(Date(), nullable=False)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Beirut")
    target_topics_min: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    target_topics_max: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="SCHEDULED",
    )
    curator_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    pipeline_trace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    generated_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detection_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    extra_selected_article_ids: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    compose_instructions_fr: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    topics: Mapped[list["EditionTopic"]] = relationship(
        "EditionTopic",
        back_populates="edition",
        cascade="all, delete-orphan",
    )


class EditionTopic(Base):
    """Sujet éditorial (sommaire Curateur ou journaliste)."""

    __tablename__ = "edition_topics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    edition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editions.id", ondelete="CASCADE"),
        nullable=False,
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    user_rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    title_proposed: Mapped[str] = mapped_column(String(500), nullable=False)
    title_final: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="proposed"
    )
    country_coverage: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )
    angle_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dominant_angle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    counter_angle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    editorial_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    generated_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    angle_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    development_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_multi_perspective: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    countries: Mapped[Optional[list[str]]] = mapped_column(
        "topic_country_codes", ARRAY(String(10)), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    edition: Mapped["Edition"] = relationship("Edition", back_populates="topics")
    article_links: Mapped[list["EditionTopicArticle"]] = relationship(
        "EditionTopicArticle",
        back_populates="edition_topic",
        cascade="all, delete-orphan",
    )


class EditionTopicArticle(Base):
    """Pivot articles ↔ sujet d’édition."""

    __tablename__ = "edition_topic_articles"

    edition_topic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("edition_topics.id", ondelete="CASCADE"),
        primary_key=True,
    )
    article_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("articles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    is_recommended: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_selected: Mapped[bool] = mapped_column(default=False, nullable=False)
    rank_in_topic: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fit_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    perspective_rarity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    display_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    edition_topic: Mapped["EditionTopic"] = relationship(
        "EditionTopic", back_populates="article_links"
    )


class PipelineDebugLog(Base):
    """Rapport JSON par étape (dedup, clustering, curation, …)."""

    __tablename__ = "pipeline_debug_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    edition_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editions.id", ondelete="SET NULL"),
        nullable=True,
    )
    step: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class LLMCallLog(Base):
    """Journal des appels LLM (spec §10 / cursorrules)."""

    __tablename__ = "llm_call_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    edition_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editions.id", ondelete="SET NULL"),
        nullable=True,
    )
    prompt_id: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False)
    model_used: Mapped[str] = mapped_column(String(128), nullable=False)
    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    temperature: Mapped[float] = mapped_column(nullable=False)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[Optional[float]] = mapped_column(nullable=True)
    input_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    output_raw: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_parsed: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    validation_errors: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
