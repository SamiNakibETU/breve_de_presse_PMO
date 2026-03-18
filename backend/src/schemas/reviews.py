from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class GenerateReviewRequest(BaseModel):
    article_ids: list[str] = Field(..., min_length=1, max_length=10)


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


class ReviewListResponse(BaseModel):
    reviews: list[ReviewResponse]


class GenerateReviewResponse(BaseModel):
    review_id: str
    full_text: str
    article_count: int
