import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base


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
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["ReviewItem"]] = relationship(
        back_populates="review", cascade="all, delete-orphan"
    )


class ReviewItem(Base):
    __tablename__ = "review_items"
    __table_args__ = (
        UniqueConstraint("review_id", "article_id", name="uq_review_item_review_article"),
    )

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
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    review: Mapped["Review"] = relationship(back_populates="items")
