import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def test_batch_vectors_from_numpy_like_cohere_sdk():
    """Le SDK Cohere renvoie souvent des ndarray ; éviter `or` sur le tableau."""
    import numpy as np

    from src.services.embedding_service import _batch_vectors_from_cohere_embeddings

    obj = MagicMock()
    obj.float_ = np.array([[0.1, 0.2], [0.3, 0.4]], dtype=np.float32)
    out = _batch_vectors_from_cohere_embeddings(obj)
    np.testing.assert_allclose(out, [[0.1, 0.2], [0.3, 0.4]], rtol=1e-5, atol=1e-5)


@pytest.mark.asyncio
async def test_embed_texts_returns_vectors():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.embeddings.float_ = [[0.1] * 1024, [0.2] * 1024]
    mock_client.embed = AsyncMock(return_value=mock_response)
    mock_settings = MagicMock()
    mock_settings.cohere_api_key = "test-key"

    with patch("src.services.embedding_service.get_settings", return_value=mock_settings), \
         patch("src.services.embedding_service.cohere.AsyncClientV2", return_value=mock_client):
        from src.services.embedding_service import EmbeddingService

        service = EmbeddingService()
        vectors = await service.embed_texts(["test article 1", "test article 2"])
        assert len(vectors) == 2
        assert len(vectors[0]) == 1024


@pytest.mark.asyncio
async def test_embed_texts_batches_large_input():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.embeddings.float_ = [[0.1] * 1024] * 96
    mock_client.embed = AsyncMock(return_value=mock_response)
    mock_settings = MagicMock()
    mock_settings.cohere_api_key = "test-key"

    with patch("src.services.embedding_service.get_settings", return_value=mock_settings), \
         patch("src.services.embedding_service.cohere.AsyncClientV2", return_value=mock_client):
        from src.services.embedding_service import EmbeddingService

        service = EmbeddingService()
        texts = [f"article {i}" for i in range(200)]
        vectors = await service.embed_texts(texts)
        assert mock_client.embed.call_count >= 3  # 200/96 = 3 batches


@pytest.mark.asyncio
async def test_embed_query_returns_vector():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.embeddings.float_ = [[0.3] * 1024]
    mock_client.embed = AsyncMock(return_value=mock_response)
    mock_settings = MagicMock()
    mock_settings.cohere_api_key = "test-key"

    with patch("src.services.embedding_service.get_settings", return_value=mock_settings), \
         patch("src.services.embedding_service.cohere.AsyncClientV2", return_value=mock_client):
        from src.services.embedding_service import EmbeddingService

        service = EmbeddingService()
        vec = await service.embed_query("Iran missiles Gulf")
        assert len(vec) == 1024
        mock_client.embed.assert_called_once()
        call_kw = mock_client.embed.call_args[1]
        assert call_kw.get("input_type") == "search_query"


def test_embedding_content_hash_is_deterministic():
    """Le hash de contenu doit être identique pour le même contenu."""
    import hashlib

    def _hash(title: str, summary: str) -> str:
        content = f"{title}\n{summary}".strip()
        return hashlib.sha256(content.encode()).hexdigest()[:32]

    h1 = _hash("Iran nuclear deal", "Summary about Iran")
    h2 = _hash("Iran nuclear deal", "Summary about Iran")
    h3 = _hash("Different title", "Summary about Iran")
    assert h1 == h2
    assert h1 != h3
    assert len(h1) == 32
