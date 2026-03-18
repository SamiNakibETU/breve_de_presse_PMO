from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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


class ArticleListResponse(BaseModel):
    articles: list[ArticleResponse]
    total: int


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
