from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

# Same lifespan-patching convention as tests/test_rag_api.py.


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_run_executes_a_business_api_case_with_no_llm_involved(*_mocks):
    with TestClient(app) as client:
        response = client.post(
            "/evaluation/run",
            json={
                "organizationId": str(uuid4()),
                "userId": str(uuid4()),
                "role": "ADMIN",
                "cases": [
                    {
                        "id": str(uuid4()),
                        "category": "BUSINESS_API",
                        "question": "What is the status of order 10291?",
                        "expectedAnswerContains": "DELAYED",
                        "metadata": {"toolName": "get_order", "arguments": {"order_id": "10291"}},
                    }
                ],
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 1
    assert body["results"][0]["category"] == "BUSINESS_API"
    assert body["metrics"]["totalCases"] == 1
    assert body["model"] == "claude-sonnet-5"
    assert body["provider"] == "anthropic"


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_run_rejects_an_empty_case_list(*_mocks):
    with TestClient(app) as client:
        response = client.post(
            "/evaluation/run",
            json={"organizationId": str(uuid4()), "userId": str(uuid4()), "role": "ADMIN", "cases": []},
        )

    assert response.status_code == 422


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_run_rejects_an_unknown_category(*_mocks):
    with TestClient(app) as client:
        response = client.post(
            "/evaluation/run",
            json={
                "organizationId": str(uuid4()),
                "userId": str(uuid4()),
                "role": "ADMIN",
                "cases": [{"id": str(uuid4()), "category": "NOT_A_REAL_CATEGORY", "question": "q"}],
            },
        )

    assert response.status_code == 422


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_run_never_maps_a_single_cases_llm_error_to_an_http_error(*_mocks):
    with patch("app.evaluation.runner._retrieve_context", new_callable=AsyncMock) as mock_retrieve, patch(
        "app.evaluation.runner.generate_answer", new_callable=AsyncMock
    ) as mock_generate:
        from app.rag.errors import LlmUnavailableError

        mock_retrieve.return_value = ([], [])
        mock_generate.side_effect = LlmUnavailableError("Your credit balance is too low")

        with TestClient(app) as client:
            response = client.post(
                "/evaluation/run",
                json={
                    "organizationId": str(uuid4()),
                    "userId": str(uuid4()),
                    "role": "ADMIN",
                    "cases": [{"id": str(uuid4()), "category": "DOCUMENT_QA", "question": "What is the refund policy?"}],
                },
            )

    assert response.status_code == 200
    body = response.json()
    assert body["results"][0]["passed"] is False
    assert "credit balance" in body["results"][0]["error"]
