import httpx
import pytest

from app.tools import business_client
from app.tools.business_client import MockBusinessNotFoundError


@pytest.fixture(autouse=True)
def _reset_client():
    business_client._client = None
    yield
    business_client._client = None


def _install_mock_transport(handler):
    business_client._client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="http://mock-business.test"
    )


async def test_get_order_returns_parsed_json():
    def handler(request):
        assert request.url.path == "/orders/10291"
        return httpx.Response(200, json={"id": "10291", "status": "DELAYED"})

    _install_mock_transport(handler)

    result = await business_client.get_order("10291")

    assert result == {"id": "10291", "status": "DELAYED"}


async def test_get_customer_404_raises_not_found():
    _install_mock_transport(lambda request: httpx.Response(404))

    with pytest.raises(MockBusinessNotFoundError):
        await business_client.get_customer("CUST-9999")


async def test_get_inventory_5xx_raises_http_status_error():
    _install_mock_transport(lambda request: httpx.Response(500))

    with pytest.raises(httpx.HTTPStatusError):
        await business_client.get_inventory("SKU-2040")


async def test_list_orders_omits_none_query_params():
    captured = {}

    def handler(request):
        captured["params"] = dict(request.url.params)
        return httpx.Response(200, json=[])

    _install_mock_transport(handler)

    await business_client.list_orders(status=None, from_date="2026-08-01", to_date=None)

    assert captured["params"] == {"from": "2026-08-01"}


async def test_list_orders_returns_a_list():
    _install_mock_transport(lambda request: httpx.Response(200, json=[{"id": "10001"}]))

    result = await business_client.list_orders()

    assert result == [{"id": "10001"}]


async def test_get_revenue_analytics_forwards_date_range():
    captured = {}

    def handler(request):
        captured["params"] = dict(request.url.params)
        return httpx.Response(200, json={"totalRevenue": 100})

    _install_mock_transport(handler)

    await business_client.get_revenue_analytics(from_date="2026-08-01", to_date="2026-08-31")

    assert captured["params"] == {"from": "2026-08-01", "to": "2026-08-31"}
