import pytest
from unittest.mock import MagicMock, patch


@pytest.mark.asyncio
async def test_embed_texts_returns_vectors():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.embeddings.float_ = [[0.1] * 1024, [0.2] * 1024]
    mock_client.embed = MagicMock(return_value=mock_response)
    mock_settings = MagicMock()
    mock_settings.cohere_api_key = "test-key"

    with patch("src.services.embedding_service.get_settings", return_value=mock_settings), \
         patch("src.services.embedding_service.cohere.ClientV2", return_value=mock_client):
        from src.services.embedding_service import EmbeddingService
        service = EmbeddingService()
        vectors = service.embed_texts(["test article 1", "test article 2"])
        assert len(vectors) == 2
        assert len(vectors[0]) == 1024


@pytest.mark.asyncio
async def test_embed_texts_batches_large_input():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.embeddings.float_ = [[0.1] * 1024] * 96
    mock_client.embed = MagicMock(return_value=mock_response)
    mock_settings = MagicMock()
    mock_settings.cohere_api_key = "test-key"

    with patch("src.services.embedding_service.get_settings", return_value=mock_settings), \
         patch("src.services.embedding_service.cohere.ClientV2", return_value=mock_client):
        from src.services.embedding_service import EmbeddingService
        service = EmbeddingService()
        texts = [f"article {i}" for i in range(200)]
        vectors = service.embed_texts(texts)
        assert mock_client.embed.call_count >= 3  # 200/96 = 3 batches


def test_embed_query_returns_vector():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.embeddings.float_ = [[0.3] * 1024]
    mock_client.embed = MagicMock(return_value=mock_response)
    mock_settings = MagicMock()
    mock_settings.cohere_api_key = "test-key"

    with patch("src.services.embedding_service.get_settings", return_value=mock_settings), \
         patch("src.services.embedding_service.cohere.ClientV2", return_value=mock_client):
        from src.services.embedding_service import EmbeddingService
        service = EmbeddingService()
        vec = service.embed_query("Iran missiles Gulf")
        assert len(vec) == 1024
        mock_client.embed.assert_called_once()
        call_kw = mock_client.embed.call_args[1]
        assert call_kw.get("input_type") == "search_query"
