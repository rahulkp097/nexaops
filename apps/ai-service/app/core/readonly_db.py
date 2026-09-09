import asyncpg

from app.core.config import get_settings

# A separate pool from app.core.db's, authenticated as nexaops_readonly
# rather than nexaops_app — Phase 12's NL-to-SQL tool must never share a
# connection/role with anything that can write.
_pool: asyncpg.Pool | None = None


async def init_readonly_db_pool() -> None:
    global _pool
    settings = get_settings()
    _pool = await asyncpg.create_pool(
        settings.database_readonly_url,
        min_size=1,
        max_size=2,
        timeout=3,
        # Belt-and-suspenders alongside the role-level `statement_timeout`
        # already set on nexaops_readonly (see the Phase 1 grants
        # migration) — a query is bounded even if that role setting were
        # ever misconfigured.
        command_timeout=5,
    )


async def close_readonly_db_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_readonly_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Read-only database pool is not initialized")
    return _pool


async def check_readonly_db() -> None:
    async with get_readonly_pool().acquire() as connection:
        await connection.fetchval("SELECT 1")
