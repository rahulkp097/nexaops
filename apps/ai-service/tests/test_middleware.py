from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

# Same lifespan-patching convention as tests/test_health.py.


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.health.check_db", new_callable=AsyncMock)
@patch("app.api.health.check_readonly_db", new_callable=AsyncMock)
@patch("app.api.health.check_redis", new_callable=AsyncMock)
def test_response_carries_a_generated_request_id_when_none_was_sent(*_mocks):
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.headers["x-request-id"]


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.health.check_db", new_callable=AsyncMock)
@patch("app.api.health.check_readonly_db", new_callable=AsyncMock)
@patch("app.api.health.check_redis", new_callable=AsyncMock)
def test_response_echoes_back_an_incoming_request_id(*_mocks):
    with TestClient(app) as client:
        response = client.get("/health", headers={"X-Request-Id": "req-from-gateway"})

    assert response.headers["x-request-id"] == "req-from-gateway"


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.health.check_db", new_callable=AsyncMock)
@patch("app.api.health.check_readonly_db", new_callable=AsyncMock)
def test_request_id_is_available_to_application_code_while_handling_the_request(*_mocks):
    from app.core.request_context import get_request_id

    with patch("app.api.health.check_redis", new_callable=AsyncMock) as mock_check:

        async def _capture(*_args, **_kwargs):
            assert get_request_id() == "req-during-handling"

        mock_check.side_effect = _capture

        with TestClient(app) as client:
            client.get("/health", headers={"X-Request-Id": "req-during-handling"})

    # Outside any request, the contextvar is back to its default.
    assert get_request_id() == "-"
