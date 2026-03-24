"""
Cohere embedding service for article semantic vectors.
"""

from __future__ import annotations

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
INPUT_TYPE_DOCUMENT = "search_document"
INPUT_TYPE_QUERY = "search_query"


def _batch_vectors_from_cohere_embeddings(embeddings_obj) -> list[list[float]]:
    """Extrait les vecteurs float sans `or` sur ndarray (évite ValueError numpy truthiness)."""
    raw = getattr(embeddings_obj, "float_", None)
    if raw is None:
        raw = embeddings_obj
    if raw is None:
        return []
    if hasattr(raw, "tolist"):
        raw = raw.tolist()
    if not raw:
        return []
    if isinstance(raw[0], (int, float)):
        return [list(map(float, raw))]
    return [list(map(float, row)) for row in raw]


class EmbeddingService:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.cohere_api_key:
            raise ValueError("COHERE_API_KEY is required for embedding service")
        self.client = cohere.AsyncClientV2(api_key=settings.cohere_api_key)

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            response = await self.client.embed(
                texts=batch,
                model=MODEL,
                input_type=INPUT_TYPE_DOCUMENT,
                embedding_types=["float"],
            )
            all_embeddings.extend(
                _batch_vectors_from_cohere_embeddings(response.embeddings)
            )
        return all_embeddings

    async def embed_query(self, text: str) -> list[float]:
        """Vecteur pour recherche sémantique (asymétrique vs search_document)."""
        response = await self.client.embed(
            texts=[text[:8000]],
            model=MODEL,
            input_type=INPUT_TYPE_QUERY,
            embedding_types=["float"],
        )
        batch = _batch_vectors_from_cohere_embeddings(response.embeddings)
        if not batch:
            raise ValueError("Cohere embed returned no vectors for query")
        return batch[0]

    async def embed_pending_articles(self, db: AsyncSession) -> int:
        settings = get_settings()
        stmt = (
            select(Article)
            .where(Article.status == "translated")
            .where(Article.summary_fr.isnot(None))
            .where(Article.embedding.is_(None))
            .where(Article.is_syndicated.is_(False))
            .where(Article.canonical_article_id.is_(None))
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
        embeddings = await self.embed_texts(texts)

        for article, embedding in zip(articles, embeddings):
            article.embedding = embedding

        await db.commit()
        logger.info("embedded_articles", count=len(articles))
        return len(articles)
