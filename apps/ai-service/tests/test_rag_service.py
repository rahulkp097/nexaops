from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.schemas import HistoryMessageDto
from app.rag.service import run_rag_query, stream_rag_query
from app.rag.types import RetrievedChunk


async def _collect(async_iterator):
    return [item async for item in async_iterator]


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
async def test_retrieval_logs_chunk_count_and_organization_id(mock_embed, mock_retrieve, mock_generate, caplog):
    mock_embed.return_value = [0.1, 0.2]
    mock_retrieve.return_value = [_make_chunk(), _make_chunk()]
    mock_generate.return_value = "answer"
    org_id = uuid4()

    with caplog.at_level("INFO", logger="app.rag.service"):
        await run_rag_query("What is the refund policy?", org_id)

    assert any(
        "Retrieval completed" in record.message and str(org_id) in record.message and "chunks=2" in record.message
        for record in caplog.records
    )


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
    await run_rag_query("What is the refund policy?", org_id, metadata_filter=metadata_filter)

    mock_retrieve.assert_awaited_once_with(
        org_id,
        "What is the refund policy?",
        [0.1, 0.2],
        top_k=8,
        candidate_pool_size=20,
        metadata_filter=metadata_filter,
    )


@patch("app.rag.service.generate_answer", new_callable=AsyncMock)
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_run_rag_query_forwards_history_and_question_as_messages(
    mock_embed, mock_retrieve, mock_generate
):
    mock_embed.return_value = [0.1]
    mock_retrieve.return_value = []
    mock_generate.return_value = "answer"
    history = [
        HistoryMessageDto(role="user", content="Hi"),
        HistoryMessageDto(role="assistant", content="Hello!"),
    ]

    await run_rag_query("Follow-up question?", uuid4(), history=history)

    messages = mock_generate.call_args.kwargs["messages"]
    assert messages[0] == {"role": "user", "content": "Hi"}
    assert messages[1] == {"role": "assistant", "content": "Hello!"}
    assert messages[2]["role"] == "user"
    assert "Follow-up question?" in messages[2]["content"]


@patch("app.rag.service.generate_answer", new_callable=AsyncMock)
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_run_rag_query_forwards_conversation_summary_into_the_system_prompt(
    mock_embed, mock_retrieve, mock_generate
):
    mock_embed.return_value = [0.1]
    mock_retrieve.return_value = []
    mock_generate.return_value = "answer"

    await run_rag_query(
        "Follow-up question?", uuid4(), conversation_summary="The user previously asked about refunds."
    )

    system_prompt = mock_generate.call_args.kwargs["system"]
    assert "The user previously asked about refunds." in system_prompt


@patch("app.rag.service.stream_answer")
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_stream_rag_query_emits_sources_then_tokens_then_done(
    mock_embed, mock_retrieve, mock_stream_answer
):
    mock_embed.return_value = [0.1, 0.2]
    chunk = _make_chunk()
    mock_retrieve.return_value = [chunk]

    async def fake_stream_answer(**_kwargs):
        for token in ["Refunds ", "within 30 days."]:
            yield token

    mock_stream_answer.side_effect = fake_stream_answer

    events = await _collect(stream_rag_query("What is the refund policy?", uuid4()))

    assert [evt.event for evt in events] == ["source", "token", "token", "done"]
    assert events[0].data["chunkId"] == str(chunk.chunk_id)
    assert events[1].data == {"text": "Refunds "}
    assert events[2].data == {"text": "within 30 days."}
    assert events[3].data["answer"] == "Refunds within 30 days."
    assert events[3].data["model"] == "claude-sonnet-5"
    assert events[3].data["provider"] == "anthropic"


@patch("app.rag.service.stream_answer")
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_stream_rag_query_forwards_conversation_summary_into_the_system_prompt(
    mock_embed, mock_retrieve, mock_stream_answer
):
    mock_embed.return_value = [0.1]
    mock_retrieve.return_value = []

    async def fake_stream_answer(**_kwargs):
        yield "answer"

    mock_stream_answer.side_effect = fake_stream_answer

    await _collect(
        stream_rag_query("question", uuid4(), conversation_summary="Earlier, the user asked about refunds.")
    )

    system_prompt = mock_stream_answer.call_args.kwargs["system"]
    assert "Earlier, the user asked about refunds." in system_prompt


@patch("app.rag.service.stream_answer")
@patch("app.rag.service.retrieve_top_chunks", new_callable=AsyncMock)
@patch("app.rag.service.embed_query", new_callable=AsyncMock)
async def test_stream_rag_query_propagates_llm_errors_after_sources(
    mock_embed, mock_retrieve, mock_stream_answer
):
    mock_embed.return_value = [0.1]
    mock_retrieve.return_value = []

    async def fake_stream_answer(**_kwargs):
        raise LlmUnavailableError("rate limited")
        yield  # pragma: no cover - makes this an async generator function

    mock_stream_answer.side_effect = fake_stream_answer

    with pytest.raises(LlmUnavailableError):
        await _collect(stream_rag_query("question", uuid4()))
