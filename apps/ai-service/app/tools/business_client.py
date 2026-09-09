from typing import Any

import httpx

from app.core.config import get_settings

# services/mock-business (Phase 10) represents one shared demo company's
# operational data — unlike documents/conversations, it has no
# organization_id/tenant concept at all, so nothing here takes or forwards
# one. A real multi-tenant deployment would replace this with each
# tenant's own connected business systems.


class MockBusinessNotFoundError(Exception):
    """The requested entity doesn't exist in mock-business. Deliberately
    not a ToolError: "no such order" is a legitimate answer for the model
    to receive as data, not a tool failure — handlers catch this and
    return a `{"found": false, ...}` result instead of raising."""


_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        settings = get_settings()
        _client = httpx.AsyncClient(base_url=settings.mock_business_url, timeout=settings.tool_call_timeout_seconds)
    return _client


async def _get(path: str, params: dict[str, Any] | None = None) -> Any:
    response = await _get_client().get(path, params={k: v for k, v in (params or {}).items() if v is not None})
    if response.status_code == 404:
        raise MockBusinessNotFoundError(f"{path} returned 404")
    response.raise_for_status()
    return response.json()


async def get_customer(customer_id: str) -> dict[str, Any]:
    return await _get(f"/customers/{customer_id}")


async def get_order(order_id: str) -> dict[str, Any]:
    return await _get(f"/orders/{order_id}")


async def list_orders(
    status: str | None = None, from_date: str | None = None, to_date: str | None = None
) -> list[dict[str, Any]]:
    return await _get("/orders", {"status": status, "from": from_date, "to": to_date})


async def get_inventory(sku: str) -> dict[str, Any]:
    return await _get(f"/inventory/{sku}")


async def list_inventory_events(from_date: str | None = None, to_date: str | None = None) -> list[dict[str, Any]]:
    return await _get("/inventory/events", {"from": from_date, "to": to_date})


async def get_revenue_analytics(from_date: str | None = None, to_date: str | None = None) -> dict[str, Any]:
    return await _get("/analytics/revenue", {"from": from_date, "to": to_date})
