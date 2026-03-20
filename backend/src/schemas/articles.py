from datetime import datetime
from typing import Annotated, Any, Optional

from pydantic import BaseModel, Field


class ArticleIdBatchRequest(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=100)


class ArticleResponse(BaseModel):
    id: str
    title_fr: Optional[str] = None
    title_original: str
    media_source_id: str
    media_name: str
    country: str
    country_code: str
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    article_type: Optional[str] = None
    source_language: Optional[str] = None
    translation_confidence: Optional[float] = None
    translation_notes: Optional[str] = None
    summary_fr: Optional[str] = None
    thesis_summary_fr: Optional[str] = None
    key_quotes_fr: Optional[list[str]] = None
    url: str
    status: str
    word_count: Optional[int] = None
    collected_at: datetime
    editorial_relevance: Optional[int] = None
    why_ranked: Optional[dict[str, Any]] = None
    olj_topic_ids: Optional[list[str]] = None
    article_family: Optional[str] = None
    paywall_observed: Optional[bool] = None
    published_at_source: Optional[str] = None
    stance_summary: Optional[str] = None
    primary_editorial_event_id: Optional[str] = None
    processing_error: Optional[str] = None
    translation_failure_count: Optional[int] = None


class ArticleListResponse(BaseModel):
    articles: list[ArticleResponse]
    total: int


class ArticleIdsRequest(BaseModel):
    ids: Annotated[list[str], Field(default_factory=list, max_length=100)]


class MediaSourceResponse(BaseModel):
    id: str
    name: str
    country: str
    country_code: str
    tier: int
    languages: list[str]
    bias: Optional[str] = None
    collection_method: str
    paywall: str
    is_active: bool
    last_collected_at: Optional[datetime] = None
