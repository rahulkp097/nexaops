from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.cache import build_cache_key, get_cached, set_cached
from app.core.config import get_settings
from app.tools import business_client
from app.tools.business_client import MockBusinessNotFoundError
from app.tools.registry import ToolRegistry
from app.tools.types import ToolContext, ToolDefinition

# Order/customer/inventory data is "operational knowledge" (spec §11:
# "MANAGER: operational knowledge and permitted analytics") — EMPLOYEE gets
# chat/document access only, not business-system lookups.
_OPERATIONAL_ROLES = frozenset({"ADMIN", "MANAGER"})

_DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"
_DATE_DESC_FROM = "Earliest date, inclusive, as YYYY-MM-DD. Omit for no lower bound."
_DATE_DESC_TO = "Latest date, inclusive, as YYYY-MM-DD. Omit for no upper bound."


class GetOrderInput(BaseModel):
    order_id: str = Field(..., min_length=1, max_length=50, description='The order id, e.g. "10291".')


async def _get_order(input_model: GetOrderInput, _context: ToolContext) -> dict[str, Any]:
    try:
        order = await business_client.get_order(input_model.order_id)
    except MockBusinessNotFoundError:
        return {"found": False, "orderId": input_model.order_id}
    return {"found": True, **order}


class GetCustomerInput(BaseModel):
    customer_id: str = Field(..., min_length=1, max_length=50, description='The customer id, e.g. "CUST-1005".')


async def _get_customer(input_model: GetCustomerInput, _context: ToolContext) -> dict[str, Any]:
    try:
        customer = await business_client.get_customer(input_model.customer_id)
    except MockBusinessNotFoundError:
        return {"found": False, "customerId": input_model.customer_id}
    return {"found": True, **customer}


class GetInventoryStatusInput(BaseModel):
    sku: str = Field(..., min_length=1, max_length=50, description='The product sku, e.g. "SKU-2040".')


async def _get_inventory_status(input_model: GetInventoryStatusInput, _context: ToolContext) -> dict[str, Any]:
    try:
        item = await business_client.get_inventory(input_model.sku)
    except MockBusinessNotFoundError:
        return {"found": False, "sku": input_model.sku}
    return {"found": True, **item}


class GetInventoryEventsInput(BaseModel):
    sku: str | None = Field(
        None, max_length=50, description='Restrict to one product sku, e.g. "SKU-2040". Omit for all skus.'
    )
    from_date: str | None = Field(None, pattern=_DATE_PATTERN, description=_DATE_DESC_FROM)
    to_date: str | None = Field(None, pattern=_DATE_PATTERN, description=_DATE_DESC_TO)


async def _get_inventory_events(input_model: GetInventoryEventsInput, _context: ToolContext) -> dict[str, Any]:
    events = await business_client.list_inventory_events(input_model.from_date, input_model.to_date)
    if input_model.sku:
        events = [event for event in events if event["sku"] == input_model.sku]
    return {"events": events}


OrderStatus = Literal["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "DELAYED", "CANCELLED"]


class QuerySalesInput(BaseModel):
    status: OrderStatus | None = Field(None, description="Restrict to one order status. Omit for all statuses.")
    from_date: str | None = Field(None, pattern=_DATE_PATTERN, description=_DATE_DESC_FROM)
    to_date: str | None = Field(None, pattern=_DATE_PATTERN, description=_DATE_DESC_TO)


async def _query_sales(input_model: QuerySalesInput, context: ToolContext) -> dict[str, Any]:
    # Phase 20 (spec §29: "Cache safe, repeatable retrieval/analytics
    # results where useful"). Keyed by organization even though
    # mock-business's data is identical for every org today (spec's "do not
    # cache across organizations" is a blanket rule, not conditioned on
    # whether today's backend happens to be multi-tenant) — see
    # app.core.cache.build_cache_key.
    cache_key = build_cache_key(
        context.organization_id,
        "analytics",
        "query_sales",
        input_model.status or "-",
        input_model.from_date or "-",
        input_model.to_date or "-",
    )
    cached = await get_cached(cache_key)
    if cached is not None:
        return cached

    orders = await business_client.list_orders(input_model.status, input_model.from_date, input_model.to_date)
    summarized = [
        {
            "id": order["id"],
            "customerId": order["customerId"],
            "status": order["status"],
            "total": order["total"],
            "placedAt": order["placedAt"],
        }
        for order in orders
    ]
    result = {"orders": summarized, "count": len(summarized)}
    await set_cached(cache_key, result, get_settings().cache_ttl_seconds)
    return result


Metric = Literal["total_revenue", "average_order_value", "order_count", "delayed_order_count"]


class CalculateMetricInput(BaseModel):
    metric: Metric = Field(..., description="Which single aggregate metric to compute.")
    from_date: str | None = Field(None, pattern=_DATE_PATTERN, description=_DATE_DESC_FROM)
    to_date: str | None = Field(None, pattern=_DATE_PATTERN, description=_DATE_DESC_TO)


async def _calculate_metric(input_model: CalculateMetricInput, context: ToolContext) -> dict[str, Any]:
    # spec §29's own example key shape is exactly this metric:
    # org:{orgId}:analytics:revenue:{from}:{to}.
    cache_key = build_cache_key(
        context.organization_id,
        "analytics",
        input_model.metric,
        input_model.from_date or "-",
        input_model.to_date or "-",
    )
    cached = await get_cached(cache_key)
    if cached is not None:
        return cached

    if input_model.metric == "delayed_order_count":
        orders = await business_client.list_orders("DELAYED", input_model.from_date, input_model.to_date)
        value: float = len(orders)
    else:
        analytics = await business_client.get_revenue_analytics(input_model.from_date, input_model.to_date)
        value = {
            "total_revenue": analytics["totalRevenue"],
            "average_order_value": analytics["averageOrderValue"],
            "order_count": analytics["orderCount"],
        }[input_model.metric]

    result = {"metric": input_model.metric, "value": value, "from": input_model.from_date, "to": input_model.to_date}
    await set_cached(cache_key, result, get_settings().cache_ttl_seconds)
    return result


def register_all(target: ToolRegistry) -> None:
    target.register(
        ToolDefinition(
            name="get_order",
            description=(
                "Look up a single order by id, including its status, line items, and (for a "
                "DELAYED order) why it was delayed. Returns {found: false} if the order id "
                "doesn't exist — that is a normal result, not an error."
            ),
            input_model=GetOrderInput,
            handler=_get_order,
            allowed_roles=_OPERATIONAL_ROLES,
            timeout_seconds=5.0,
            max_result_bytes=8_000,
        )
    )
    target.register(
        ToolDefinition(
            name="get_customer",
            description=(
                "Look up a single customer by id (name, email, segment). Returns {found: false} "
                "if the customer id doesn't exist. Does not return that customer's orders — use "
                "query_sales for that."
            ),
            input_model=GetCustomerInput,
            handler=_get_customer,
            allowed_roles=_OPERATIONAL_ROLES,
            timeout_seconds=5.0,
            max_result_bytes=4_000,
        )
    )
    target.register(
        ToolDefinition(
            name="get_inventory_status",
            description=(
                "Look up current stock level and status (IN_STOCK/LOW_STOCK/OUT_OF_STOCK) for one "
                "product sku. Returns {found: false} if the sku doesn't exist."
            ),
            input_model=GetInventoryStatusInput,
            handler=_get_inventory_status,
            allowed_roles=_OPERATIONAL_ROLES,
            timeout_seconds=5.0,
            max_result_bytes=4_000,
        )
    )
    target.register(
        ToolDefinition(
            name="get_inventory_events",
            description=(
                "List inventory movement events (restocks, sales, adjustments, shortages), "
                "optionally filtered to one sku and/or a date range. Use this to explain *why* "
                "an item is low or out of stock."
            ),
            input_model=GetInventoryEventsInput,
            handler=_get_inventory_events,
            allowed_roles=_OPERATIONAL_ROLES,
            timeout_seconds=5.0,
            max_result_bytes=32_000,
        )
    )
    target.register(
        ToolDefinition(
            name="query_sales",
            description=(
                "List orders, optionally filtered by status and/or a placed-date range. Returns a "
                "summary per order (id, customer, status, total, date), not full line items — use "
                "get_order for one order's full detail. Narrow the date range if you only need a "
                "specific period."
            ),
            input_model=QuerySalesInput,
            handler=_query_sales,
            allowed_roles=_OPERATIONAL_ROLES,
            timeout_seconds=5.0,
            max_result_bytes=32_000,
        )
    )
    target.register(
        ToolDefinition(
            name="calculate_metric",
            description=(
                "Compute one named aggregate business metric — total_revenue, "
                "average_order_value, order_count, or delayed_order_count — optionally over a "
                "placed-date range. Revenue counts every non-cancelled order's full value in the "
                "period it was placed, not a delivery-recognized figure. This is not a "
                "general-purpose calculator or SQL tool; unsupported metrics are rejected."
            ),
            input_model=CalculateMetricInput,
            handler=_calculate_metric,
            allowed_roles=_OPERATIONAL_ROLES,
            timeout_seconds=5.0,
            max_result_bytes=2_000,
        )
    )
