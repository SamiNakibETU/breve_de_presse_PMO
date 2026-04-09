"""
Cohere embedding service for article semantic vectors.
"""

from __future__ import annotations

import hashlib
import time
import uuid

import cohere
import structlog
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.models.article import Article
from src.services.article_analysis_priority import EDITORIAL_TYPES_SQL_TUPLE
from src.services.cost_estimate import estimate_cohere_embed_usage
from src.services.editorial_article_types import EDITORIAL_CLUSTER_TYPES
from src.services.media_revue_registry import get_media_revue_registry_ids
from src.services.provider_usage_ledger import append_provider_usage_commit

logger = structlog.get_logger()

BATCH_SIZE = 96
MODEL = "embed-multilingual-v3.0"
INPUT_TYPE_DOCUMENT = "search_document"
INPUT_TYPE_QUERY = "search_query"


def _band_order_case():
    return case(
        (Article.relevance_band == "high", 0),
        (Article.relevance_band == "medium", 1),
        (Article.relevance_band == "low", 2),
        else_=3,
    )


def _editorial_type_order_case():
    lowered = func.lower(func.coalesce(Article.article_type, ""))
    return case((lowered.in_(EDITORIAL_TYPES_SQL_TUPLE), 0), else_=1)


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
            t0 = time.perf_counter()
            response = await self.client.embed(
                texts=batch,
                model=MODEL,
                input_type=INPUT_TYPE_DOCUMENT,
                embedding_types=["float"],
            )
            dur_ms = int((time.perf_counter() - t0) * 1000)
            all_embeddings.extend(
                _batch_vectors_from_cohere_embeddings(response.embeddings)
            )
            inp_u, out_u, cost = estimate_cohere_embed_usage(texts=batch, vector_dim=1024)
            await append_provider_usage_commit(
                kind="embedding",
                provider="cohere",
                model=MODEL,
                operation="embed_batch",
                status="ok",
                input_units=inp_u,
                output_units=out_u,
                cost_usd_est=cost,
                duration_ms=dur_ms,
                meta_json={"batch_size": len(batch), "input_type": INPUT_TYPE_DOCUMENT},
            )
        return all_embeddings

    async def embed_query(self, text: str) -> list[float]:
        """Vecteur pour recherche sémantique (asymétrique vs search_document)."""
        t0 = time.perf_counter()
        response = await self.client.embed(
            texts=[text[:8000]],
            model=MODEL,
            input_type=INPUT_TYPE_QUERY,
            embedding_types=["float"],
        )
        dur_ms = int((time.perf_counter() - t0) * 1000)
        batch = _batch_vectors_from_cohere_embeddings(response.embeddings)
        inp_u, out_u, cost = estimate_cohere_embed_usage(texts=[text[:8000]], vector_dim=1024)
        await append_provider_usage_commit(
            kind="embedding",
            provider="cohere",
            model=MODEL,
            operation="embed_query",
            status="ok",
            input_units=inp_u,
            output_units=out_u,
            cost_usd_est=cost,
            duration_ms=dur_ms,
            meta_json={"input_type": INPUT_TYPE_QUERY},
        )
        if not batch:
            raise ValueError("Cohere embed returned no vectors for query")
        return batch[0]

    async def embed_pending_articles(
        self,
        db: AsyncSession,
        *,
        edition_id: uuid.UUID | None = None,
    ) -> int:
        settings = get_settings()
        stmt = (
            select(Article)
            .where(Article.status == "translated")
            .where(Article.summary_fr.isnot(None))
            .where(Article.embedding.is_(None))
            .where(Article.is_syndicated.is_(False))
            .where(Article.canonical_article_id.is_(None))
        )
        if edition_id is not None:
            stmt = stmt.where(Article.edition_id == edition_id)
        if settings.embed_only_editorial_types:
            stmt = stmt.where(Article.article_type.in_(tuple(EDITORIAL_CLUSTER_TYPES)))
        if settings.embed_revue_registry_only:
            reg = get_media_revue_registry_ids()
            if not reg:
                logger.warning("embedding.revue_registry_empty_skip")
                return 0
            stmt = stmt.where(Article.media_source_id.in_(tuple(reg)))

        lim = settings.embedding_batch_limit
        if settings.embed_prioritize_editorial_order:
            band_ord = _band_order_case()
            type_ord = _editorial_type_order_case()
            stmt = stmt.order_by(
                type_ord.asc(),
                band_ord.asc(),
                Article.collected_at.desc(),
            )
        else:
            stmt = stmt.order_by(Article.collected_at.desc())
        stmt = stmt.limit(lim)

        result = await db.execute(stmt)
        articles = list(result.scalars().all())

        if not articles:
            return 0

        def _content_hash(a: Article) -> str:
            content = f"{a.title_fr or ''}\n{a.summary_fr or ''}".strip()
            return hashlib.sha256(content.encode()).hexdigest()[:32]

        # Filtrer les articles dont le contenu n'a pas changé (cache hash)
        to_embed = []
        skipped_cached = 0
        for a in articles:
            h = _content_hash(a)
            if a.embedding is not None and a.embedding_content_hash == h:
                skipped_cached += 1
                continue
            to_embed.append((a, h))

        ed_count = sum(
            1
            for a, _ in to_embed
            if (a.article_type or "").strip().lower() in EDITORIAL_CLUSTER_TYPES
        )
        logger.info(
            "embedding.batch_selected",
            count=len(to_embed),
            skipped_cached=skipped_cached,
            editorial_types_in_batch=ed_count,
            non_editorial_in_batch=len(to_embed) - ed_count,
            embed_only_editorial_types=settings.embed_only_editorial_types,
            embed_revue_registry_only=settings.embed_revue_registry_only,
            embedding_batch_limit=lim,
            edition_id=str(edition_id) if edition_id else None,
        )

        if not to_embed:
            return 0

        texts = [
            f"{a.title_fr or ''} {a.summary_fr or ''}".strip()
            for a, _ in to_embed
        ]
        embeddings = await self.embed_texts(texts)

        for (article, h), embedding in zip(to_embed, embeddings):
            article.embedding = embedding
            article.embedding_content_hash = h

        await db.commit()
        logger.info("embedded_articles", count=len(to_embed))
        return len(to_embed)
