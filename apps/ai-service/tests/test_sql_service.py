from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.sql.errors import SqlExecutionError, SqlGenerationError, SqlValidationError
from app.sql.service import run_sales_query


@patch("app.sql.service.execute_readonly_query", new_callable=AsyncMock)
@patch("app.sql.service.validate_and_rewrite")
@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_run_sales_query_wires_generate_validate_execute_in_order(
    mock_generate, mock_validate, mock_execute
):
    mock_generate.return_value = "SELECT COUNT(*) FROM sales_orders"
    mock_validate.return_value = "SELECT COUNT(*) FROM sales_orders LIMIT 100"
    mock_execute.return_value = [{"count": 32}]

    result = await run_sales_query("How many orders are there?", uuid4())

    mock_generate.assert_awaited_once_with("How many orders are there?")
    mock_validate.assert_called_once_with("SELECT COUNT(*) FROM sales_orders")
    mock_execute.assert_awaited_once_with("SELECT COUNT(*) FROM sales_orders LIMIT 100")
    assert result.sql == "SELECT COUNT(*) FROM sales_orders LIMIT 100"
    assert result.rows == [{"count": 32}]
    assert result.row_count == 1


@patch("app.sql.service.execute_readonly_query", new_callable=AsyncMock)
@patch("app.sql.service.validate_and_rewrite")
@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_run_sales_query_logs_row_count_on_success(mock_generate, mock_validate, mock_execute, caplog):
    mock_generate.return_value = "SELECT COUNT(*) FROM sales_orders"
    mock_validate.return_value = "SELECT COUNT(*) FROM sales_orders LIMIT 100"
    mock_execute.return_value = [{"count": 32}]

    with caplog.at_level("INFO", logger="app.sql.service"):
        await run_sales_query("How many orders are there?", uuid4())

    assert any("SQL query executed" in r.message and "rows=1" in r.message for r in caplog.records)


@patch("app.sql.service.validate_and_rewrite")
@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_run_sales_query_logs_a_warning_when_validation_rejects_it(mock_generate, mock_validate, caplog):
    mock_generate.return_value = "DROP TABLE sales_orders"
    mock_validate.side_effect = SqlValidationError("Only SELECT statements are allowed")

    with caplog.at_level("WARNING", logger="app.sql.service"), pytest.raises(SqlValidationError):
        await run_sales_query("question", uuid4())

    assert any("rejected by validator" in r.message for r in caplog.records)


@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_run_sales_query_propagates_a_generation_error(mock_generate):
    mock_generate.side_effect = SqlGenerationError("provider unavailable")

    with pytest.raises(SqlGenerationError):
        await run_sales_query("question", uuid4())


@patch("app.sql.service.validate_and_rewrite")
@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_run_sales_query_propagates_a_validation_error_without_executing_anything(
    mock_generate, mock_validate
):
    mock_generate.return_value = "DROP TABLE sales_orders"
    mock_validate.side_effect = SqlValidationError("Only SELECT statements are allowed")

    with pytest.raises(SqlValidationError):
        await run_sales_query("question", uuid4())


@patch("app.sql.service.execute_readonly_query", new_callable=AsyncMock)
@patch("app.sql.service.validate_and_rewrite")
@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_run_sales_query_propagates_an_execution_error(mock_generate, mock_validate, mock_execute):
    mock_generate.return_value = "SELECT COUNT(*) FROM sales_orders"
    mock_validate.return_value = "SELECT COUNT(*) FROM sales_orders LIMIT 100"
    mock_execute.side_effect = SqlExecutionError("The query could not be executed")

    with pytest.raises(SqlExecutionError):
        await run_sales_query("question", uuid4())


@patch("app.sql.service.set_cached", new_callable=AsyncMock)
@patch("app.sql.service.get_cached", new_callable=AsyncMock)
@patch("app.sql.service.execute_readonly_query", new_callable=AsyncMock)
@patch("app.sql.service.validate_and_rewrite")
@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_a_cache_hit_skips_generation_validation_and_execution_entirely(
    mock_generate, mock_validate, mock_execute, mock_get_cached, mock_set_cached
):
    mock_get_cached.return_value = {"sql": "SELECT COUNT(*) FROM sales_orders LIMIT 100", "rows": [{"count": 32}], "row_count": 1}

    result = await run_sales_query("How many orders are there?", uuid4())

    mock_generate.assert_not_awaited()
    mock_validate.assert_not_called()
    mock_execute.assert_not_awaited()
    mock_set_cached.assert_not_awaited()
    assert result.row_count == 1
    assert result.rows == [{"count": 32}]


@patch("app.sql.service.set_cached", new_callable=AsyncMock)
@patch("app.sql.service.get_cached", new_callable=AsyncMock)
@patch("app.sql.service.execute_readonly_query", new_callable=AsyncMock)
@patch("app.sql.service.validate_and_rewrite")
@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_a_cache_miss_populates_the_cache_with_the_result_and_a_ttl(
    mock_generate, mock_validate, mock_execute, mock_get_cached, mock_set_cached
):
    mock_get_cached.return_value = None
    mock_generate.return_value = "SELECT COUNT(*) FROM sales_orders"
    mock_validate.return_value = "SELECT COUNT(*) FROM sales_orders LIMIT 100"
    mock_execute.return_value = [{"count": 32}]

    await run_sales_query("How many orders are there?", uuid4())

    mock_set_cached.assert_awaited_once()
    key, value, ttl = mock_set_cached.call_args.args
    assert value == {"sql": "SELECT COUNT(*) FROM sales_orders LIMIT 100", "rows": [{"count": 32}], "row_count": 1}
    assert ttl == 300
    assert key.startswith("org:")
    assert ":sql:" in key


@patch("app.sql.service.get_cached", new_callable=AsyncMock)
async def test_cache_key_differs_by_organization(mock_get_cached):
    mock_get_cached.return_value = None
    org_a, org_b = uuid4(), uuid4()

    with patch("app.sql.service.generate_sql", new_callable=AsyncMock, return_value="SELECT COUNT(*) FROM sales_orders"), \
         patch("app.sql.service.validate_and_rewrite", return_value="SELECT COUNT(*) FROM sales_orders LIMIT 100"), \
         patch("app.sql.service.execute_readonly_query", new_callable=AsyncMock, return_value=[]):
        await run_sales_query("How many orders?", org_a)
        await run_sales_query("How many orders?", org_b)

    keys = [call.args[0] for call in mock_get_cached.call_args_list]
    assert keys[0] != keys[1]
    assert str(org_a) in keys[0]
    assert str(org_b) in keys[1]
