from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.tools.business_client import MockBusinessNotFoundError

# Same lifespan-patching convention as tests/test_rag_api.py.


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.tools.business_tools.business_client.get_order", new_callable=AsyncMock)
def test_execute_get_order_end_to_end_through_the_real_registry(mock_get_order, *_mocks):
    mock_get_order.return_value = {"id": "10291", "status": "DELAYED"}

    with TestClient(app) as client:
        response = client.post(
            "/tools/execute",
            json={
                "tool": "get_order",
                "arguments": {"order_id": "10291"},
                "organizationId": str(uuid4()),
                "userId": str(uuid4()),
                "role": "MANAGER",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["data"] == {"found": True, "id": "10291", "status": "DELAYED"}


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_execute_unknown_tool_returns_200_with_a_structured_error(*_mocks):
    with TestClient(app) as client:
        response = client.post(
            "/tools/execute",
            json={
                "tool": "delete_everything",
                "arguments": {},
                "organizationId": str(uuid4()),
                "userId": str(uuid4()),
                "role": "ADMIN",
            },
        )

    # Tool-level failures are a 200 with ok:false, not an HTTP error — the
    # model is meant to see and react to this, not have the request abort.
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["errorCode"] == "tool_not_found"


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_execute_rejects_a_role_not_allowed_to_call_the_tool(*_mocks):
    with TestClient(app) as client:
        response = client.post(
            "/tools/execute",
            json={
                "tool": "get_order",
                "arguments": {"order_id": "10291"},
                "organizationId": str(uuid4()),
                "userId": str(uuid4()),
                "role": "EMPLOYEE",
            },
        )

    body = response.json()
    assert body["ok"] is False
    assert body["errorCode"] == "unauthorized"


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_execute_malformed_organization_id_is_rejected_before_any_tool_runs(*_mocks):
    with TestClient(app) as client:
        response = client.post(
            "/tools/execute",
            json={
                "tool": "get_order",
                "arguments": {"order_id": "10291"},
                "organizationId": "not-a-uuid",
                "userId": str(uuid4()),
                "role": "ADMIN",
            },
        )

    assert response.status_code == 422


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.tools.business_tools.business_client.get_customer", new_callable=AsyncMock)
def test_execute_not_found_from_mock_business_is_a_successful_result(mock_get_customer, *_mocks):
    mock_get_customer.side_effect = MockBusinessNotFoundError("404")

    with TestClient(app) as client:
        response = client.post(
            "/tools/execute",
            json={
                "tool": "get_customer",
                "arguments": {"customer_id": "CUST-9999"},
                "organizationId": str(uuid4()),
                "userId": str(uuid4()),
                "role": "ADMIN",
            },
        )

    body = response.json()
    assert body["ok"] is True
    assert body["data"] == {"found": False, "customerId": "CUST-9999"}
