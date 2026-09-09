import logging
from typing import Any

import asyncpg

from app.core.readonly_db import get_readonly_pool
from app.sql.errors import SqlExecutionError

logger = logging.getLogger(__name__)


async def execute_readonly_query(sql_text: str) -> list[dict[str, Any]]:
    """Executes already-validated SQL (see validator.validate_and_rewrite)
    against the nexaops_readonly connection pool. Never call this with
    anything that hasn't been through the validator."""
    pool = get_readonly_pool()
    try:
        async with pool.acquire() as connection:
            rows = await connection.fetch(sql_text)
    except asyncpg.QueryCanceledError as exc:
        logger.warning("SQL tool query timed out: %s", sql_text)
        raise SqlExecutionError("The query took too long and was cancelled") from exc
    except asyncpg.PostgresError as exc:
        # Validated SQL can still fail at execution time (e.g. a type
        # mismatch the validator doesn't model) — log the real reason,
        # surface only a generic one.
        logger.warning("SQL tool query failed: %s (sql=%s)", exc, sql_text)
        raise SqlExecutionError("The query could not be executed") from exc

    return [dict(row) for row in rows]
