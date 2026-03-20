from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=2000)
    limit: int = Field(default=30, ge=1, le=100)
    hours: int = Field(default=168, ge=1, le=720)
    country_codes: Optional[list[str]] = None
    article_types: Optional[list[str]] = None
    topic_ids: Optional[list[str]] = None


class SemanticSearchHit(BaseModel):
    article_id: str
    distance: float
    title_fr: Optional[str] = None
    url: str


class SemanticSearchResponse(BaseModel):
    hits: list[SemanticSearchHit]
    query: str


class SavedSearchCreate(BaseModel):
    query_text: str = Field(..., min_length=1, max_length=2000)
    filters_json: Optional[dict[str, Any]] = None
    owner: Optional[str] = Field(None, max_length=255)


class SavedSearchResponse(BaseModel):
    id: str
    query_text: str
    filters_json: Optional[dict[str, Any]] = None
    owner: Optional[str] = None
    created_at: datetime


class TranslationReviewCreate(BaseModel):
    article_id: str
    rating: int = Field(..., ge=1, le=5)
    reviewer: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = None


class TranslationReviewResponse(BaseModel):
    id: str
    article_id: str
    rating: int
    reviewer: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
