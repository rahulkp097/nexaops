import asyncpg

from app.core.config import get_settings

_pool: asyncpg.Pool | None = None


async def init_db_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        get_settings().database_app_url,
        min_size=1,
        max_size=2,
        timeout=3,
        command_timeout=3,
    )


async def close_db_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def check_db() -> None:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    async with _pool.acquire() as connection:
        await connection.fetchval("SELECT 1")
