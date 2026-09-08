import asyncpg
from pgvector.asyncpg import register_vector

from app.core.config import get_settings

_pool: asyncpg.Pool | None = None


async def _register_vector_codec(connection: asyncpg.Connection) -> None:
    await register_vector(connection)


async def init_db_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        get_settings().database_app_url,
        min_size=1,
        max_size=2,
        timeout=3,
        command_timeout=3,
        init=_register_vector_codec,
    )


async def close_db_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    return _pool


async def check_db() -> None:
    async with get_pool().acquire() as connection:
        await connection.fetchval("SELECT 1")
