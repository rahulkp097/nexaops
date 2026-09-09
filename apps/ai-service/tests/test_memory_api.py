from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.rag.errors import LlmRequestError, LlmUnavailableError

# Same lifespan-patching convention as tests/test_rag_api.py.


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.memory.summarize_conversation", new_callable=AsyncMock)
def test_summarize_returns_the_summary(mock_summarize, *_mocks):
    mock_summarize.return_value = "The user asked about order 10291, which is delayed."

    with TestClient(app) as client:
        response = client.post(
            "/memory/summarize",
            json={"messages": [{"role": "user", "content": "What is order 10291's status?"}]},
        )

    assert response.status_code == 200
    assert response.json()["summary"] == "The user asked about order 10291, which is delayed."
    mock_summarize.assert_awaited_once()
    assert mock_summarize.call_args.args[0] is None


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.memory.summarize_conversation", new_callable=AsyncMock)
def test_summarize_forwards_the_previous_summary(mock_summarize, *_mocks):
    mock_summarize.return_value = "updated summary"

    with TestClient(app) as client:
        response = client.post(
            "/memory/summarize",
            json={
                "previousSummary": "The user asked about order 10291.",
                "messages": [{"role": "assistant", "content": "It's delayed."}],
            },
        )

    assert response.status_code == 200
    assert mock_summarize.call_args.args[0] == "The user asked about order 10291."


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_summarize_rejects_an_empty_messages_list(*_mocks):
    with TestClient(app) as client:
        response = client.post("/memory/summarize", json={"messages": []})

    assert response.status_code == 422


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.memory.summarize_conversation", new_callable=AsyncMock)
def test_summarize_maps_llm_unavailable_to_503(mock_summarize, *_mocks):
    mock_summarize.side_effect = LlmUnavailableError("rate limited")

    with TestClient(app) as client:
        response = client.post(
            "/memory/summarize",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )

    assert response.status_code == 503


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.memory.summarize_conversation", new_callable=AsyncMock)
def test_summarize_maps_llm_request_error_to_502(mock_summarize, *_mocks):
    mock_summarize.side_effect = LlmRequestError("bad key")

    with TestClient(app) as client:
        response = client.post(
            "/memory/summarize",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )

    assert response.status_code == 502
