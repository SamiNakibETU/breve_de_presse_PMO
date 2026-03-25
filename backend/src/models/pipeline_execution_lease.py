"""Verrou distribué pipeline (une ligne par clé de lease)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base


class PipelineExecutionLease(Base):
    """Lease Postgres pour un seul run pipeline à la fois (multi-instances)."""

    __tablename__ = "pipeline_execution_lease"

    lease_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    holder_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    trigger_label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acquired_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    heartbeat_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
