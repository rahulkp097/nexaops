from redis.asyncio import Redis

from app.core.config import get_settings

_client: Redis | None = None


async def init_redis_client() -> None:
    global _client
    _client = Redis.from_url(
        get_settings().redis_url,
        socket_connect_timeout=3,
        socket_timeout=3,
    )


async def close_redis_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def check_redis() -> None:
    if _client is None:
        raise RuntimeError("Redis client is not initialized")
    await _client.ping()
