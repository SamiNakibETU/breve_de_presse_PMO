import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base


class CollectionLog(Base):
    __tablename__ = "collection_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    media_source_id: Mapped[Optional[str]] = mapped_column(
        String(50), ForeignKey("media_sources.id")
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    articles_found: Mapped[int] = mapped_column(Integer, default=0)
    articles_new: Mapped[int] = mapped_column(Integer, default=0)
    articles_error: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="running")
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    articles_filtered: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    extraction_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    extraction_primary_success: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
