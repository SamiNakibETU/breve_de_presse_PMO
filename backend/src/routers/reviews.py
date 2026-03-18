from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models.review import Review, ReviewItem
from src.schemas.reviews import (
    GenerateReviewRequest,
    GenerateReviewResponse,
    ReviewListResponse,
    ReviewResponse,
)
from src.services.generator import PressReviewGenerator

router = APIRouter(prefix="/api")


@router.post("/reviews/generate", response_model=GenerateReviewResponse)
async def generate_review(body: GenerateReviewRequest):
    generator = PressReviewGenerator()
    try:
        result = await generator.generate_full_review(body.article_ids)
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))

    return GenerateReviewResponse(**result)


@router.get("/reviews", response_model=ReviewListResponse)
async def list_reviews(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Review).order_by(Review.review_date.desc()).limit(30)
    )
    reviews = result.scalars().all()

    items: list[ReviewResponse] = []
    for r in reviews:
        item_count = (
            await db.execute(
                select(func.count(ReviewItem.id)).where(ReviewItem.review_id == r.id)
            )
        ).scalar() or 0

        items.append(
            ReviewResponse(
                id=str(r.id),
                title=r.title,
                review_date=r.review_date,
                status=r.status,
                full_text=r.full_text,
                article_count=item_count,
                created_at=r.created_at,
            )
        )

    return ReviewListResponse(reviews=items)


@router.get("/reviews/{review_id}", response_model=ReviewResponse)
async def get_review(review_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(404, "Review not found")

    item_count = (
        await db.execute(
            select(func.count(ReviewItem.id)).where(ReviewItem.review_id == review.id)
        )
    ).scalar() or 0

    return ReviewResponse(
        id=str(review.id),
        title=review.title,
        review_date=review.review_date,
        status=review.status,
        full_text=review.full_text,
        article_count=item_count,
        created_at=review.created_at,
    )
