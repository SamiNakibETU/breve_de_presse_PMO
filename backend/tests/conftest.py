import asyncio
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.models.base import Base
from src.models.article import Article
from src.models.media_source import MediaSource


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture()
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture()
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture()
async def sample_source(db_session: AsyncSession):
    source = MediaSource(
        id="test_source",
        name="Test News",
        country="Test Country",
        country_code="TC",
        tier=1,
        languages=["en"],
        url="https://test.example.com",
        rss_url="https://test.example.com/rss",
        collection_method="rss",
    )
    db_session.add(source)
    await db_session.commit()
    return source


@pytest.fixture()
async def sample_article(db_session: AsyncSession, sample_source: MediaSource):
    article = Article(
        id=uuid.uuid4(),
        media_source_id=sample_source.id,
        url="https://test.example.com/article-1",
        url_hash="abc123hash",
        title_original="Test Article Title",
        content_original="This is a test article with enough content to be processed. " * 20,
        author="Test Author",
        published_at=datetime.now(timezone.utc),
        source_language="en",
        status="collected",
        word_count=200,
    )
    db_session.add(article)
    await db_session.commit()
    return article


MOCK_TRANSLATION_JSON = {
    "translated_title": "Titre de test traduit",
    "thesis_summary": "Résumé de la thèse de test",
    "summary_fr": " ".join(["Ceci est un résumé de test."] * 30),
    "key_quotes_fr": ["« Citation de test »"],
    "article_type": "analysis",
    "article_family": "analysis",
    "olj_topic_ids": ["mena.geopolitics", "other"],
    "stance_summary": "L'auteur souligne un enjeu géopolitique régional.",
    "event_extraction": {
        "who": "Acteurs régionaux",
        "what": "Tensions",
        "where": "Moyen-Orient",
        "when": "2026",
        "canonical_event_label_fr": "Tensions régionales",
        "completeness_0_1": 0.4,
    },
    "source_spans": [{"text_excerpt": "extrait", "role": "quote"}],
    "entities": [
        {"name": "Test Person", "type": "PERSON", "name_fr": "Personne Test"}
    ],
    "confidence_score": 0.92,
    "translation_notes": "",
}


@pytest.fixture()
def mock_llm_router():
    """Mock LLMRouter that returns well-formed JSON for both translate and generate."""
    router = MagicMock()
    router.translate = AsyncMock(
        return_value=json.dumps(MOCK_TRANSLATION_JSON, ensure_ascii=False),
    )
    router.generate = AsyncMock(
        return_value="« Titre reformulé — Thèse de l'auteur »\n\nRésumé : ...\n\nFiche : ...",
    )
    return router
