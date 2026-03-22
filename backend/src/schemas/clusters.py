"""
Pydantic schemas for cluster API responses.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ThesisPreviewItem(BaseModel):
    thesis: str
    media_name: str | None = None
    article_type: str | None = None
    author: str | None = None
    country: str | None = None
    source_language: str | None = None


class ClusterResponse(BaseModel):
    id: UUID
    label: str | None
    article_count: int
    country_count: int
    avg_relevance: float
    latest_article_at: datetime | None
    is_active: bool
    countries: list[str] = []
    is_emerging: bool = False
    thesis_previews: list[ThesisPreviewItem] = []

    class Config:
        from_attributes = True


class ClusterListResponse(BaseModel):
    clusters: list[ClusterResponse]
    total: int
    noise_count: int


class ClusterRefreshResponse(BaseModel):
    clusters_created: int
    articles_clustered: int
    articles_embedded: int
    clusters_labeled: int
    insights_updated: int = 0
