from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.tools import business_tools
from app.tools.business_client import MockBusinessNotFoundError
from app.tools.registry import ToolRegistry
from app.tools.types import ToolContext


def _context(role: str = "MANAGER") -> ToolContext:
    return ToolContext(organization_id=uuid4(), user_id=uuid4(), role=role)


def _registry() -> ToolRegistry:
    registry = ToolRegistry()
    business_tools.register_all(registry)
    return registry


async def test_get_order_found_merges_the_order_into_the_result():
    with patch("app.tools.business_tools.business_client.get_order", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"id": "10291", "status": "DELAYED"}
        result = await _registry().execute("get_order", {"order_id": "10291"}, _context())

    assert result.ok is True
    assert result.data == {"found": True, "id": "10291", "status": "DELAYED"}


async def test_get_order_not_found_is_a_successful_result_not_an_error():
    with patch("app.tools.business_tools.business_client.get_order", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = MockBusinessNotFoundError("404")
        result = await _registry().execute("get_order", {"order_id": "99999"}, _context())

    assert result.ok is True
    assert result.data == {"found": False, "orderId": "99999"}


async def test_get_order_rejects_employee_role():
    result = await _registry().execute("get_order", {"order_id": "10291"}, _context(role="EMPLOYEE"))

    assert result.ok is False
    assert result.error_code == "unauthorized"


async def test_get_customer_found():
    with patch("app.tools.business_tools.business_client.get_customer", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"id": "CUST-1005", "name": "Northwind Robotics"}
        result = await _registry().execute("get_customer", {"customer_id": "CUST-1005"}, _context())

    assert result.data == {"found": True, "id": "CUST-1005", "name": "Northwind Robotics"}


async def test_get_inventory_status_not_found():
    with patch("app.tools.business_tools.business_client.get_inventory", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = MockBusinessNotFoundError("404")
        result = await _registry().execute("get_inventory_status", {"sku": "SKU-0000"}, _context())

    assert result.data == {"found": False, "sku": "SKU-0000"}


async def test_get_inventory_events_filters_by_sku_client_side():
    events = [
        {"id": "EVT-1", "sku": "SKU-2040", "type": "SHORTAGE"},
        {"id": "EVT-2", "sku": "SKU-2011", "type": "SALE"},
    ]
    with patch("app.tools.business_tools.business_client.list_inventory_events", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = events
        result = await _registry().execute("get_inventory_events", {"sku": "SKU-2040"}, _context())

    assert result.ok is True
    assert result.data == {"events": [events[0]]}


async def test_get_inventory_events_without_sku_returns_everything():
    events = [{"id": "EVT-1", "sku": "SKU-2040"}, {"id": "EVT-2", "sku": "SKU-2011"}]
    with patch("app.tools.business_tools.business_client.list_inventory_events", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = events
        result = await _registry().execute("get_inventory_events", {}, _context())

    assert result.data == {"events": events}


async def test_get_inventory_events_rejects_a_malformed_date():
    result = await _registry().execute("get_inventory_events", {"from_date": "not-a-date"}, _context())

    assert result.ok is False
    assert result.error_code == "invalid_arguments"


async def test_query_sales_returns_a_trimmed_summary_not_full_line_items():
    orders = [
        {
            "id": "10291",
            "customerId": "CUST-1005",
            "status": "DELAYED",
            "total": 267,
            "placedAt": "2026-07-14",
            "items": [{"sku": "SKU-2040", "quantity": 3}],
        }
    ]
    with patch("app.tools.business_tools.business_client.list_orders", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = orders
        result = await _registry().execute("query_sales", {"status": "DELAYED"}, _context())

    assert result.ok is True
    assert result.data == {
        "orders": [
            {"id": "10291", "customerId": "CUST-1005", "status": "DELAYED", "total": 267, "placedAt": "2026-07-14"}
        ],
        "count": 1,
    }


async def test_query_sales_is_served_from_cache_on_a_hit_without_calling_mock_business():
    cached_result = {"orders": [{"id": "10291"}], "count": 1}
    with patch("app.tools.business_tools.get_cached", new_callable=AsyncMock, return_value=cached_result), patch(
        "app.tools.business_tools.business_client.list_orders", new_callable=AsyncMock
    ) as mock_list:
        result = await _registry().execute("query_sales", {"status": "DELAYED"}, _context())

    mock_list.assert_not_awaited()
    assert result.data == cached_result


async def test_query_sales_populates_the_cache_on_a_miss():
    orders = [{"id": "10291", "customerId": "CUST-1005", "status": "DELAYED", "total": 267, "placedAt": "2026-07-14"}]
    context = _context()
    with patch("app.tools.business_tools.get_cached", new_callable=AsyncMock, return_value=None), patch(
        "app.tools.business_tools.set_cached", new_callable=AsyncMock
    ) as mock_set, patch("app.tools.business_tools.business_client.list_orders", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = orders
        await _registry().execute("query_sales", {"status": "DELAYED"}, context)

    mock_set.assert_awaited_once()
    key, value, ttl = mock_set.call_args.args
    assert key == f"org:{context.organization_id}:analytics:query_sales:DELAYED:-:-"
    assert value["count"] == 1
    assert ttl == 300


async def test_query_sales_rejects_an_unknown_status():
    result = await _registry().execute("query_sales", {"status": "ARCHIVED"}, _context())

    assert result.ok is False
    assert result.error_code == "invalid_arguments"


async def test_calculate_metric_total_revenue_reads_from_analytics():
    with patch(
        "app.tools.business_tools.business_client.get_revenue_analytics", new_callable=AsyncMock
    ) as mock_analytics:
        mock_analytics.return_value = {"totalRevenue": 6035.8, "averageOrderValue": 188.62, "orderCount": 32}
        result = await _registry().execute(
            "calculate_metric", {"metric": "total_revenue", "from_date": "2026-08-01"}, _context()
        )

    assert result.ok is True
    assert result.data == {"metric": "total_revenue", "value": 6035.8, "from": "2026-08-01", "to": None}


async def test_calculate_metric_delayed_order_count_counts_orders_instead():
    with patch("app.tools.business_tools.business_client.list_orders", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = [{"id": "10291"}, {"id": "10305"}]
        result = await _registry().execute("calculate_metric", {"metric": "delayed_order_count"}, _context())

    mock_list.assert_awaited_once_with("DELAYED", None, None)
    assert result.data == {"metric": "delayed_order_count", "value": 2, "from": None, "to": None}


async def test_calculate_metric_is_served_from_cache_on_a_hit_without_calling_mock_business():
    cached_result = {"metric": "total_revenue", "value": 6035.8, "from": None, "to": None}
    with patch("app.tools.business_tools.get_cached", new_callable=AsyncMock, return_value=cached_result), patch(
        "app.tools.business_tools.business_client.get_revenue_analytics", new_callable=AsyncMock
    ) as mock_analytics:
        result = await _registry().execute("calculate_metric", {"metric": "total_revenue"}, _context())

    mock_analytics.assert_not_awaited()
    assert result.data == cached_result


async def test_calculate_metric_cache_key_matches_specs_own_example_shape():
    context = _context()
    with patch("app.tools.business_tools.get_cached", new_callable=AsyncMock, return_value=None), patch(
        "app.tools.business_tools.set_cached", new_callable=AsyncMock
    ) as mock_set, patch(
        "app.tools.business_tools.business_client.get_revenue_analytics", new_callable=AsyncMock
    ) as mock_analytics:
        mock_analytics.return_value = {"totalRevenue": 6035.8, "averageOrderValue": 188.62, "orderCount": 32}
        await _registry().execute(
            "calculate_metric",
            {"metric": "total_revenue", "from_date": "2026-08-01", "to_date": "2026-08-31"},
            context,
        )

    key = mock_set.call_args.args[0]
    assert key == f"org:{context.organization_id}:analytics:total_revenue:2026-08-01:2026-08-31"


async def test_calculate_metric_rejects_an_unsupported_metric_name():
    result = await _registry().execute("calculate_metric", {"metric": "made_up_metric"}, _context())

    assert result.ok is False
    assert result.error_code == "invalid_arguments"
