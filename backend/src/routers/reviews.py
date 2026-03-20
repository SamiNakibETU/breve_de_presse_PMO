import html
import os
import unicodedata
import uuid
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.deps.auth import require_internal_key
from src.limiter import limiter
from src.models.article import Article
from src.models.media_source import MediaSource
from src.models.review import Review, ReviewItem
from src.models.review_selection_event import ReviewSelectionEvent
from src.config import get_settings
from src.schemas.reviews import (
    GenerateReviewRequest,
    GenerateReviewResponse,
    ReviewListResponse,
    ReviewResponse,
)
from src.services.generator import PressReviewGenerator

router = APIRouter(prefix="/api")


def _pdf_ascii_fold(text: str) -> str:
    n = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in n if ord(c) < 128)


def _resolve_pdf_unicode_font_path() -> Optional[Path]:
    """DejaVuSans.ttf ou équivalent : settings, env, chemins système courants."""
    s = get_settings()
    for raw in (
        s.pdf_unicode_font_path,
        os.environ.get("MEMW_PDF_FONT_PATH"),
        os.environ.get("FPDF_UNICODE_FONT"),
    ):
        if raw and Path(raw).is_file():
            return Path(raw)
    for p in (
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/ttf-dejavu/DejaVuSans.ttf"),
        Path("C:/Windows/Fonts/DejaVuSans.ttf"),
    ):
        if p.is_file():
            return p
    return None


@router.post("/reviews/generate", response_model=GenerateReviewResponse)
@limiter.limit("20/minute")
async def generate_review(
    request: Request,
    body: GenerateReviewRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
    x_editor_id: Annotated[Optional[str], Header()] = None,
):
    generator = PressReviewGenerator()
    try:
        result = await generator.generate_full_review(
            body.article_ids,
            created_by=x_editor_id,
        )
    except Exception as exc:
        raise HTTPException(500, detail=str(exc)) from exc

    if body.log_selection_analytics:
        try:
            aids = [uuid.UUID(str(x).strip()) for x in body.article_ids]
            cc_stmt = (
                select(MediaSource.country_code)
                .select_from(Article)
                .join(MediaSource, Article.media_source_id == MediaSource.id)
                .where(Article.id.in_(aids))
            )
            rows = (await db.execute(cc_stmt)).all()
            codes = sorted({str(r[0]) for r in rows if r[0]})
            rid = uuid.UUID(str(result["review_id"]))
            db.add(
                ReviewSelectionEvent(
                    article_ids=list(body.article_ids),
                    country_codes=codes,
                    editor_id=(x_editor_id or None),
                    review_id=rid,
                )
            )
            await db.commit()
        except Exception:
            await db.rollback()

    return GenerateReviewResponse(**result)


@router.get("/reviews/{review_id}/export/newsletter", response_class=HTMLResponse)
async def export_review_newsletter(review_id: str, db: AsyncSession = Depends(get_db)):
    try:
        rid = uuid.UUID(review_id.strip())
    except ValueError as exc:
        raise HTTPException(400, "review_id invalide") from exc
    review = (
        await db.execute(select(Review).where(Review.id == rid))
    ).scalar_one_or_none()
    if not review or not review.full_text:
        raise HTTPException(404, "Review not found")
    title = html.escape(review.title or "Revue de presse")
    chunks = (review.full_text or "").split("\n\n")
    body_html = "<p>" + "</p><p>".join(html.escape(c) for c in chunks) + "</p>"
    doc = f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>{title}</title></head>
<body style="font-family:Georgia,serif;max-width:42rem;margin:2rem auto;line-height:1.5">
<h1 style="font-weight:600;font-size:1.25rem">{title}</h1>
{body_html}
</body></html>"""
    return HTMLResponse(content=doc)


@router.get("/reviews/{review_id}/export/text", response_class=PlainTextResponse)
async def export_review_text(review_id: str, db: AsyncSession = Depends(get_db)):
    try:
        rid = uuid.UUID(review_id.strip())
    except ValueError as exc:
        raise HTTPException(400, "review_id invalide") from exc
    review = (
        await db.execute(select(Review).where(Review.id == rid))
    ).scalar_one_or_none()
    if not review or not review.full_text:
        raise HTTPException(404, "Review not found")
    return PlainTextResponse(
        content=review.full_text,
        headers={
            "Content-Disposition": f'attachment; filename="revue-{review_id[:8]}.txt"'
        },
    )


@router.get("/reviews/{review_id}/export/pdf")
async def export_review_pdf(review_id: str, db: AsyncSession = Depends(get_db)):
    if not get_settings().pdf_export_enabled:
        raise HTTPException(
            501,
            detail="Export PDF désactivé (PDF_EXPORT_ENABLED=false).",
        )
    try:
        from fpdf import FPDF
    except ImportError as exc:
        raise HTTPException(
            501,
            detail="Dépendance fpdf2 absente.",
        ) from exc
    try:
        rid = uuid.UUID(review_id.strip())
    except ValueError as exc:
        raise HTTPException(400, "review_id invalide") from exc
    review = (
        await db.execute(select(Review).where(Review.id == rid))
    ).scalar_one_or_none()
    if not review or not review.full_text:
        raise HTTPException(404, "Review not found")

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    font_path = _resolve_pdf_unicode_font_path()
    use_unicode = False
    if font_path is not None:
        try:
            pdf.add_font("MemwUnicode", "", str(font_path))
            pdf.set_font("MemwUnicode", size=10)
            use_unicode = True
        except Exception:
            use_unicode = False
    if not use_unicode:
        pdf.set_font("Helvetica", size=10)
    title = (review.title or "Revue de presse") if use_unicode else _pdf_ascii_fold(
        review.title or "Revue de presse"
    )
    pdf.multi_cell(0, 8, title)
    pdf.ln(4)
    for block in (review.full_text or "").split("\n\n"):
        if block.strip():
            chunk = block.strip() if use_unicode else _pdf_ascii_fold(block.strip())
            pdf.multi_cell(0, 5, chunk)
            pdf.ln(2)
    body = bytes(pdf.output())
    return Response(
        content=body,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="revue-{review_id[:8]}.pdf"'
        },
    )


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
                created_by=r.created_by,
                supersedes_id=str(r.supersedes_id) if r.supersedes_id else None,
                content_snapshot_hash=r.content_snapshot_hash,
                generation_prompt_hash=r.generation_prompt_hash,
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
        created_by=review.created_by,
        supersedes_id=str(review.supersedes_id) if review.supersedes_id else None,
        content_snapshot_hash=review.content_snapshot_hash,
        generation_prompt_hash=review.generation_prompt_hash,
    )
