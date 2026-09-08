from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.service import run_rag_query
from app.rag.types import RetrievedChunk


def _make_chunk(**overrides):
    defaults = dict(
        chunk_id=uuid4(),
        document_id=uuid4(),
        filename="policy.pdf",
        content="some evidence text",
        page_number=1,
        score=0.9,
    )
    defaults.update(overrides)
    return RetrievedChunk(**defaults)


@patch("app.rag.service.generate_answer", new_callable=AsyncMock)
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_sources_are_an_exact_map_of_retrieved_chunks(mock_embed, mock_retrieve, mock_generate):
    mock_embed.return_value = [0.1, 0.2]
    chunk = _make_chunk()
    mock_retrieve.return_value = [chunk]
    mock_generate.return_value = "Here is the answer. [1]"

    result = await run_rag_query("What is the refund policy?", uuid4())

    assert result.answer == "Here is the answer. [1]"
    assert len(result.sources) == 1
    assert result.sources[0].chunk_id == chunk.chunk_id
    assert result.sources[0].document_id == chunk.document_id
    assert result.sources[0].filename == chunk.filename
    assert result.sources[0].page == chunk.page_number
    assert result.sources[0].score == chunk.score


@patch("app.rag.service.generate_answer", new_callable=AsyncMock)
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_llm_is_still_called_with_zero_retrieved_chunks(mock_embed, mock_retrieve, mock_generate):
    mock_embed.return_value = [0.1, 0.2]
    mock_retrieve.return_value = []
    mock_generate.return_value = "The available documents don't contain enough information."

    result = await run_rag_query("Unrelated question?", uuid4())

    mock_generate.assert_awaited_once()
    assert result.sources == []
    assert "don't contain enough information" in result.answer


@patch("app.rag.service.generate_answer", new_callable=AsyncMock)
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_llm_unavailable_error_propagates_unmodified(mock_embed, mock_retrieve, mock_generate):
    mock_embed.return_value = [0.1]
    mock_retrieve.return_value = []
    mock_generate.side_effect = LlmUnavailableError("rate limited")

    with pytest.raises(LlmUnavailableError):
        await run_rag_query("question", uuid4())


@patch("app.rag.service.generate_answer", new_callable=AsyncMock)
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_llm_request_error_propagates_unmodified(mock_embed, mock_retrieve, mock_generate):
    mock_embed.return_value = [0.1]
    mock_retrieve.return_value = []
    mock_generate.side_effect = LlmRequestError("bad key")

    with pytest.raises(LlmRequestError):
        await run_rag_query("question", uuid4())


@patch("app.rag.service.generate_answer", new_callable=AsyncMock)
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_retrieve_is_called_with_question_text_top_k_and_candidate_pool_size(
    mock_embed, mock_retrieve, mock_generate
):
    mock_embed.return_value = [0.1, 0.2]
    mock_retrieve.return_value = []
    mock_generate.return_value = "answer"

    org_id = uuid4()
    metadata_filter = {"category": "policy"}
    await run_rag_query("What is the refund policy?", org_id, metadata_filter)

    mock_retrieve.assert_awaited_once_with(
        org_id,
        "What is the refund policy?",
        [0.1, 0.2],
        top_k=8,
        candidate_pool_size=20,
        metadata_filter=metadata_filter,
    )
