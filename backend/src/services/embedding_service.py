"""
Cohere embedding service for article semantic vectors.
"""

import cohere
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.models.article import Article

logger = structlog.get_logger()

_EDITORIAL_TYPES = ("opinion", "editorial", "tribune", "analysis")

BATCH_SIZE = 96
MODEL = "embed-multilingual-v3.0"
INPUT_TYPE = "search_document"


class EmbeddingService:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.cohere_api_key:
            raise ValueError("COHERE_API_KEY is required for embedding service")
        self.client = cohere.ClientV2(api_key=settings.cohere_api_key)

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            response = self.client.embed(
                texts=batch,
                model=MODEL,
                input_type=INPUT_TYPE,
                embedding_types=["float"],
            )
            emb = getattr(response.embeddings, "float_", None) or response.embeddings
            all_embeddings.extend(emb)
        return all_embeddings

    async def embed_pending_articles(self, db: AsyncSession) -> int:
        settings = get_settings()
        stmt = (
            select(Article)
            .where(Article.status == "translated")
            .where(Article.summary_fr.isnot(None))
            .where(Article.embedding.is_(None))
            .limit(500)
        )
        if settings.embed_only_editorial_types:
            stmt = stmt.where(Article.article_type.in_(_EDITORIAL_TYPES))
        result = await db.execute(stmt)
        articles = result.scalars().all()

        if not articles:
            return 0

        texts = [
            f"{a.title_fr or ''} {a.summary_fr or ''}".strip()
            for a in articles
        ]
        embeddings = self.embed_texts(texts)

        for article, embedding in zip(articles, embeddings):
            article.embedding = embedding

        await db.commit()
        logger.info("embedded_articles", count=len(articles))
        return len(articles)
