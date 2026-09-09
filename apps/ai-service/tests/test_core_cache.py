from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.core.cache import build_cache_key, get_cached, set_cached


def test_build_cache_key_always_starts_with_the_organization_id():
    org_id = uuid4()

    key = build_cache_key(org_id, "analytics", "revenue", "2026-01-01", "2026-01-31")

    assert key == f"org:{org_id}:analytics:revenue:2026-01-01:2026-01-31"


async def test_get_cached_returns_none_on_a_miss():
    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=None)
    with patch("app.core.cache.get_redis_client", return_value=mock_client):
        assert await get_cached("some-key") is None


async def test_get_cached_deserializes_a_hit():
    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=b'{"total": 42}')
    with patch("app.core.cache.get_redis_client", return_value=mock_client):
        assert await get_cached("some-key") == {"total": 42}


async def test_get_cached_treats_a_redis_error_as_a_miss_not_a_raise():
    with patch("app.core.cache.get_redis_client", side_effect=RuntimeError("Redis client is not initialized")):
        assert await get_cached("some-key") is None


async def test_get_cached_treats_invalid_json_as_a_miss():
    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=b"not json")
    with patch("app.core.cache.get_redis_client", return_value=mock_client):
        assert await get_cached("some-key") is None


async def test_set_cached_writes_json_with_an_explicit_ttl():
    mock_client = MagicMock()
    mock_client.set = AsyncMock()
    with patch("app.core.cache.get_redis_client", return_value=mock_client):
        await set_cached("some-key", {"total": 42}, 300)

    mock_client.set.assert_awaited_once_with("some-key", '{"total": 42}', ex=300)


async def test_set_cached_swallows_a_redis_error_instead_of_raising():
    with patch("app.core.cache.get_redis_client", side_effect=RuntimeError("Redis client is not initialized")):
        await set_cached("some-key", {"total": 42}, 300)  # must not raise
