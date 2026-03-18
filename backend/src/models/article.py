import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    ARRAY,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base

if TYPE_CHECKING:
    from src.models.entity import ArticleEntity
    from src.models.media_source import MediaSource


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

    translation_confidence: Mapped[Optional[float]] = mapped_column(Float)
    translation_notes: Mapped[Optional[str]] = mapped_column(Text)

    olj_formatted_block: Mapped[Optional[str]] = mapped_column(Text)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="raw"
    )
    processing_error: Mapped[Optional[str]] = mapped_column(Text)

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

    media_source: Mapped["MediaSource"] = relationship(back_populates="articles")
    article_entities: Mapped[list["ArticleEntity"]] = relationship(
        back_populates="article", cascade="all, delete-orphan"
    )
