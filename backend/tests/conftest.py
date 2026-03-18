import asyncio
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


@pytest.fixture()
def mock_anthropic():
    """Mock AsyncAnthropic that returns a well-formed JSON translation response."""
    response_json = {
        "translated_title": "Titre de test traduit",
        "thesis_summary": "Résumé de la thèse de test",
        "summary_fr": " ".join(["Ceci est un résumé de test."] * 30),
        "key_quotes_fr": ["« Citation de test »"],
        "article_type": "analysis",
        "entities": [
            {"name": "Test Person", "type": "PERSON", "name_fr": "Personne Test"}
        ],
        "confidence_score": 0.92,
        "translation_notes": "",
    }

    mock_content = MagicMock()
    mock_content.text = __import__("json").dumps(response_json, ensure_ascii=False)

    mock_response = MagicMock()
    mock_response.content = [mock_content]

    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    return mock_client
