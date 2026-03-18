import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base

if TYPE_CHECKING:
    from src.models.article import Article


class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    name_fr: Mapped[Optional[str]] = mapped_column(String(500))
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    wikidata_id: Mapped[Optional[str]] = mapped_column(String(50))
    mention_count: Mapped[int] = mapped_column(Integer, default=1)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    article_links: Mapped[list["ArticleEntity"]] = relationship(
        back_populates="entity", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("name", "entity_type", name="uq_entity_name_type"),
    )


class ArticleEntity(Base):
    __tablename__ = "article_entities"

    article_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True
    )
    context: Mapped[Optional[str]] = mapped_column(Text)
    sentiment: Mapped[Optional[str]] = mapped_column(String(20))

    article: Mapped["Article"] = relationship(back_populates="article_entities")
    entity: Mapped["Entity"] = relationship(back_populates="article_links")
