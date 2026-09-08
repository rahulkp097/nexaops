from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.schemas import RagQueryResponse, SourceDto

# Same lifespan-patching convention as tests/test_health.py — TestClient as
# a context manager runs the real FastAPI lifespan.


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.rag.run_rag_query", new_callable=AsyncMock)
def test_query_returns_camel_case_response(mock_run_rag_query, *_mocks):
    mock_run_rag_query.return_value = RagQueryResponse(
        answer="Refunds are processed within 30 days.",
        sources=[
            SourceDto(
                document_id=uuid4(),
                chunk_id=uuid4(),
                filename="policy.pdf",
                page=4,
                score=0.87,
            )
        ],
    )

    with TestClient(app) as client:
        response = client.post(
            "/rag/query",
            json={"question": "What is the refund policy?", "organizationId": str(uuid4())},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "Refunds are processed within 30 days."
    assert "documentId" in body["sources"][0]
    assert "chunkId" in body["sources"][0]
    assert body["sources"][0]["page"] == 4


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.rag.run_rag_query", new_callable=AsyncMock)
def test_llm_unavailable_maps_to_503(mock_run_rag_query, *_mocks):
    mock_run_rag_query.side_effect = LlmUnavailableError("rate limited")

    with TestClient(app) as client:
        response = client.post(
            "/rag/query",
            json={"question": "question", "organizationId": str(uuid4())},
        )

    assert response.status_code == 503


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.rag.run_rag_query", new_callable=AsyncMock)
def test_llm_request_error_maps_to_502(mock_run_rag_query, *_mocks):
    mock_run_rag_query.side_effect = LlmRequestError("bad key")

    with TestClient(app) as client:
        response = client.post(
            "/rag/query",
            json={"question": "question", "organizationId": str(uuid4())},
        )

    assert response.status_code == 502


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_malformed_organization_id_is_rejected(*_mocks):
    with TestClient(app) as client:
        response = client.post(
            "/rag/query",
            json={"question": "question", "organizationId": "not-a-uuid"},
        )

    assert response.status_code == 422


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    import json

    events = []
    for block in body.strip().split("\n\n"):
        lines = block.splitlines()
        event = next(line.removeprefix("event: ") for line in lines if line.startswith("event: "))
        data = next(line.removeprefix("data: ") for line in lines if line.startswith("data: "))
        events.append((event, json.loads(data)))
    return events


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.rag.stream_rag_query")
def test_query_stream_forwards_events_as_sse(mock_stream_rag_query, *_mocks):
    from app.rag.types import RagStreamEvent

    async def fake_stream(*_args, **_kwargs):
        yield RagStreamEvent(event="source", data={"chunkId": "abc"})
        yield RagStreamEvent(event="token", data={"text": "Hello"})
        yield RagStreamEvent(event="done", data={"answer": "Hello"})

    mock_stream_rag_query.side_effect = fake_stream

    with TestClient(app) as client:
        response = client.post(
            "/rag/query/stream",
            json={"question": "What is the refund policy?", "organizationId": str(uuid4())},
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(response.text)
    assert events == [
        ("source", {"chunkId": "abc"}),
        ("token", {"text": "Hello"}),
        ("done", {"answer": "Hello"}),
    ]


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.rag.stream_rag_query")
def test_query_stream_maps_llm_unavailable_to_an_error_event(mock_stream_rag_query, *_mocks):
    async def fake_stream(*_args, **_kwargs):
        raise LlmUnavailableError("rate limited")
        yield  # pragma: no cover - makes this an async generator function

    mock_stream_rag_query.side_effect = fake_stream

    with TestClient(app) as client:
        response = client.post(
            "/rag/query/stream",
            json={"question": "question", "organizationId": str(uuid4())},
        )

    # The HTTP status is already 200 by the time the error occurs (streaming
    # has started) — the failure surfaces as an `error` SSE event instead.
    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert events == [("error", {"message": "AI provider temporarily unavailable", "retryable": True})]
