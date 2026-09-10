from uuid import uuid4

import pytest

from app.tools.registry import registry
from app.tools.types import ToolContext

# spec §30: "Question -> business API tool" against the real
# services/mock-business, not a mocked httpx client. Reuses Phase 10's own
# fixed-seed storyline (order 10291 / SKU-2040) so the expected values are
# stable across runs, same as every other phase's live verification of
# this exact data.
pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]


def _context() -> ToolContext:
    return ToolContext(organization_id=uuid4(), user_id=uuid4(), role="MANAGER")


async def test_get_order_returns_the_real_delayed_storyline_order():
    result = await registry.execute("get_order", {"order_id": "10291"}, _context())

    assert result.ok is True
    assert result.data["found"] is True
    assert result.data["status"] == "DELAYED"


async def test_get_inventory_status_returns_the_real_out_of_stock_sku():
    result = await registry.execute("get_inventory_status", {"sku": "SKU-2040"}, _context())

    assert result.ok is True
    assert result.data["found"] is True
    assert result.data["status"] == "OUT_OF_STOCK"


async def test_get_order_not_found_is_a_successful_result_against_the_real_service():
    result = await registry.execute("get_order", {"order_id": "nonexistent-order"}, _context())

    assert result.ok is True
    assert result.data == {"found": False, "orderId": "nonexistent-order"}
