"""
OLJ Press Review — Database Models
SQLAlchemy models with pgvector support.
"""

import uuid
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import (
    String, Text, Integer, SmallInteger, Float, Boolean,
    DateTime, Date, ForeignKey, UniqueConstraint, Index, ARRAY
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship
)
from sqlalchemy.ext.asyncio import (
    AsyncSession, create_async_engine, async_sessionmaker
)
from pgvector.sqlalchemy import Vector

from src.config import get_settings


class Base(DeclarativeBase):
    pass


# ─── MEDIA SOURCES ────────────────────────────────────────────────
class MediaSource(Base):
    __tablename__ = "media_sources"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    languages: Mapped[list] = mapped_column(ARRAY(Text), nullable=False)
    editorial_line: Mapped[Optional[str]] = mapped_column(Text)
    bias: Mapped[Optional[str]] = mapped_column(String(50))
    content_types: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    rss_url: Mapped[Optional[str]] = mapped_column(String(500))
    english_version_url: Mapped[Optional[str]] = mapped_column(String(500))
    collection_method: Mapped[str] = mapped_column(
        String(20), nullable=False, default="rss"
    )
    paywall: Mapped[str] = mapped_column(String(20), default="free")
    translation_quality: Mapped[str] = mapped_column(String(20), default="high")
    editorial_notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_collected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    articles: Mapped[List["Article"]] = relationship(back_populates="media_source")


# ─── ARTICLES ─────────────────────────────────────────────────────
class Article(Base):
    __tablename__ = "articles"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    media_source_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("media_sources.id"), nullable=False
    )
    
    # Original content
    url: Mapped[str] = mapped_column(String(2000), nullable=False, unique=True)
    url_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    title_original: Mapped[str] = mapped_column(Text, nullable=False)
    content_original: Mapped[Optional[str]] = mapped_column(Text)
    author: Mapped[Optional[str]] = mapped_column(String(500))
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    source_language: Mapped[Optional[str]] = mapped_column(String(10))
    
    # Processed (French)
    title_fr: Mapped[Optional[str]] = mapped_column(Text)
    thesis_summary_fr: Mapped[Optional[str]] = mapped_column(Text)
    summary_fr: Mapped[Optional[str]] = mapped_column(Text)
    key_quotes_fr: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    
    # Classification
    article_type: Mapped[Optional[str]] = mapped_column(String(30))
    
    # Quality
    translation_confidence: Mapped[Optional[float]] = mapped_column(Float)
    translation_notes: Mapped[Optional[str]] = mapped_column(Text)
    
    # OLJ output
    olj_formatted_block: Mapped[Optional[str]] = mapped_column(Text)
    
    # Status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="raw")
    processing_error: Mapped[Optional[str]] = mapped_column(Text)
    
    # Metadata
    word_count: Mapped[Optional[int]] = mapped_column(Integer)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    media_source: Mapped["MediaSource"] = relationship(back_populates="articles")
    embeddings: Mapped[List["ArticleEmbedding"]] = relationship(back_populates="article")


# ─── EMBEDDINGS ───────────────────────────────────────────────────
class ArticleEmbedding(Base):
    __tablename__ = "article_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    article_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE"), nullable=False
    )
    embedding = mapped_column(Vector(1536), nullable=False)
    embedding_model: Mapped[str] = mapped_column(
        String(100), default="text-embedding-3-small"
    )
    text_chunk: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(SmallInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    article: Mapped["Article"] = relationship(back_populates="embeddings")


# ─── ENTITIES ─────────────────────────────────────────────────────
class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    name_fr: Mapped[Optional[str]] = mapped_column(String(500))
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    wikidata_id: Mapped[Optional[str]] = mapped_column(String(50))
    mention_count: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("name", "entity_type", name="uq_entity_name_type"),
    )


# ─── REVIEWS ──────────────────────────────────────────────────────
class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[Optional[str]] = mapped_column(String(500))
    review_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    full_text: Mapped[Optional[str]] = mapped_column(Text)
    journalist_notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    items: Mapped[List["ReviewItem"]] = relationship(back_populates="review")


class ReviewItem(Base):
    __tablename__ = "review_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    review_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False
    )
    article_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("articles.id"), nullable=False
    )
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    journalist_edits: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    review: Mapped["Review"] = relationship(back_populates="items")


# ─── DATABASE SESSION ─────────────────────────────────────────────
def get_engine():
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        echo=settings.environment == "development",
        pool_size=5,
        max_overflow=10,
    )


def get_session_factory():
    engine = get_engine()
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Create all tables. Use Alembic for production migrations."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
