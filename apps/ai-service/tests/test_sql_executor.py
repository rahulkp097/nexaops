from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg
import pytest

from app.sql.errors import SqlExecutionError
from app.sql.executor import execute_readonly_query


def _make_fake_pool(rows=None, fetch_side_effect=None):
    connection = MagicMock()
    if fetch_side_effect is not None:
        connection.fetch = AsyncMock(side_effect=fetch_side_effect)
    else:
        connection.fetch = AsyncMock(return_value=rows or [])

    acquire_cm = MagicMock()
    acquire_cm.__aenter__ = AsyncMock(return_value=connection)
    acquire_cm.__aexit__ = AsyncMock(return_value=False)

    pool = MagicMock()
    pool.acquire.return_value = acquire_cm
    return pool, connection


async def test_execute_readonly_query_returns_rows_as_dicts():
    # A real asyncpg.Record supports dict(record); a plain dict already
    # does too, so it stands in fine here without needing to fake Record's
    # actual type.
    pool, connection = _make_fake_pool(rows=[{"order_id": "10291", "total": 267}])
    with patch("app.sql.executor.get_readonly_pool", return_value=pool):
        result = await execute_readonly_query("SELECT order_id, total FROM sales_orders")

    assert result == [{"order_id": "10291", "total": 267}]
    connection.fetch.assert_awaited_once_with("SELECT order_id, total FROM sales_orders")


async def test_execute_readonly_query_wraps_a_query_timeout():
    pool, _connection = _make_fake_pool(fetch_side_effect=asyncpg.QueryCanceledError("canceled"))
    with patch("app.sql.executor.get_readonly_pool", return_value=pool):
        with pytest.raises(SqlExecutionError, match="took too long"):
            await execute_readonly_query("SELECT order_id FROM sales_orders")


async def test_execute_readonly_query_wraps_a_generic_postgres_error():
    pool, _connection = _make_fake_pool(fetch_side_effect=asyncpg.DataError("bad type"))
    with patch("app.sql.executor.get_readonly_pool", return_value=pool):
        with pytest.raises(SqlExecutionError):
            await execute_readonly_query("SELECT order_id FROM sales_orders")
