import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base

if TYPE_CHECKING:
    from src.models.cluster import TopicCluster
    from src.models.edition import Edition
    from src.models.editorial_event import EditorialEvent
    from src.models.entity import ArticleEntity
    from src.models.media_source import MediaSource
    from src.models.translation_review import TranslationReview


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    media_source_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("media_sources.id"), nullable=False
    )

    url: Mapped[str] = mapped_column(String(2000), nullable=False, unique=True)
    url_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    title_original: Mapped[str] = mapped_column(Text, nullable=False)
    content_original: Mapped[Optional[str]] = mapped_column(Text)
    author: Mapped[Optional[str]] = mapped_column(String(500))
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    source_language: Mapped[Optional[str]] = mapped_column(String(10))

    title_fr: Mapped[Optional[str]] = mapped_column(Text)
    thesis_summary_fr: Mapped[Optional[str]] = mapped_column(Text)
    summary_fr: Mapped[Optional[str]] = mapped_column(Text)
    key_quotes_fr: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))

    article_type: Mapped[Optional[str]] = mapped_column(String(30))
    article_family: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    olj_topic_ids: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    paywall_observed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    published_at_source: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    dedupe_group_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    primary_editorial_event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editorial_events.id", ondelete="SET NULL"),
        nullable=True,
    )
    stance_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_extraction_json: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON, nullable=True
    )
    source_spans_json: Mapped[Optional[list[Any]]] = mapped_column(JSON, nullable=True)

    translation_confidence: Mapped[Optional[float]] = mapped_column(Float)
    translation_notes: Mapped[Optional[str]] = mapped_column(Text)

    olj_formatted_block: Mapped[Optional[str]] = mapped_column(Text)

    embedding: Mapped[Optional[list]] = mapped_column(Vector(1024), nullable=True)
    cluster_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("topic_clusters.id"), nullable=True
    )
    cluster_soft_assigned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    framing_json: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON, nullable=True
    )
    framing_actor: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    framing_tone: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    framing_prescription: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_translated_fr: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    en_translation_summary_only: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_syndicated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    canonical_article_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("articles.id", ondelete="SET NULL"),
        nullable=True,
    )
    edition_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editions.id", ondelete="SET NULL"),
        nullable=True,
    )
    relevance_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    relevance_band: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    translation_quality_flags: Mapped[Optional[list[str]]] = mapped_column(
        JSON, nullable=True
    )
    syndication_group_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    syndication_group_sources: Mapped[Optional[list[str]]] = mapped_column(
        JSON, nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="raw"
    )
    processing_error: Mapped[Optional[str]] = mapped_column(Text)
    translation_failure_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    word_count: Mapped[Optional[int]] = mapped_column(Integer)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    edition: Mapped[Optional["Edition"]] = relationship(
        "Edition", foreign_keys=[edition_id]
    )
    media_source: Mapped["MediaSource"] = relationship(back_populates="articles")
    cluster: Mapped[Optional["TopicCluster"]] = relationship(
        "TopicCluster", back_populates="articles"
    )
    article_entities: Mapped[list["ArticleEntity"]] = relationship(
        back_populates="article", cascade="all, delete-orphan"
    )
    primary_editorial_event: Mapped[Optional["EditorialEvent"]] = relationship(
        "EditorialEvent",
        back_populates="articles",
        foreign_keys=[primary_editorial_event_id],
    )
    translation_reviews: Mapped[list["TranslationReview"]] = relationship(
        "TranslationReview",
        back_populates="article",
        cascade="all, delete-orphan",
    )
