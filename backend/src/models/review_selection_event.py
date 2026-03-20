import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base


class ReviewSelectionEvent(Base):
    __tablename__ = "review_selection_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    editor_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    article_ids: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    country_codes: Mapped[Optional[list[Any]]] = mapped_column(JSONB, nullable=True)
    review_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
