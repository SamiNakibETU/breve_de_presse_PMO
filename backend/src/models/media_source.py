import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ARRAY, Boolean, DateTime, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base

if TYPE_CHECKING:
    from src.models.article import Article


class MediaSource(Base):
    __tablename__ = "media_sources"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    languages: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    editorial_line: Mapped[Optional[str]] = mapped_column(Text)
    bias: Mapped[Optional[str]] = mapped_column(String(50))
    content_types: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
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
    last_collected_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    articles: Mapped[list["Article"]] = relationship(back_populates="media_source")
