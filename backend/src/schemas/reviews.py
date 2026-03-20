from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class GenerateReviewResponse(BaseModel):
    review_id: str
    full_text: str
    article_count: int
    content_snapshot_hash: Optional[str] = None
    generation_prompt_hash: Optional[str] = None


class GenerateReviewRequest(BaseModel):
    article_ids: list[str] = Field(..., min_length=1, max_length=10)
    log_selection_analytics: bool = Field(
        default=True,
        description="Enregistrer l’événement de sélection (pays, ids) pour analytics MEMW",
    )


class ReviewItemResponse(BaseModel):
    article_id: str
    display_order: int
    title_fr: Optional[str] = None
    media_name: Optional[str] = None


class ReviewResponse(BaseModel):
    id: str
    title: Optional[str] = None
    review_date: date
    status: str
    full_text: Optional[str] = None
    article_count: int
    created_at: datetime
    created_by: Optional[str] = None
    supersedes_id: Optional[str] = None
    content_snapshot_hash: Optional[str] = None
    generation_prompt_hash: Optional[str] = None


class ReviewListResponse(BaseModel):
    reviews: list[ReviewResponse]
