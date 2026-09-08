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
