from unittest.mock import AsyncMock, patch

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

    result = await run_sales_query("How many orders are there?")

    mock_generate.assert_awaited_once_with("How many orders are there?")
    mock_validate.assert_called_once_with("SELECT COUNT(*) FROM sales_orders")
    mock_execute.assert_awaited_once_with("SELECT COUNT(*) FROM sales_orders LIMIT 100")
    assert result.sql == "SELECT COUNT(*) FROM sales_orders LIMIT 100"
    assert result.rows == [{"count": 32}]
    assert result.row_count == 1


@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_run_sales_query_propagates_a_generation_error(mock_generate):
    mock_generate.side_effect = SqlGenerationError("provider unavailable")

    with pytest.raises(SqlGenerationError):
        await run_sales_query("question")


@patch("app.sql.service.validate_and_rewrite")
@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_run_sales_query_propagates_a_validation_error_without_executing_anything(
    mock_generate, mock_validate
):
    mock_generate.return_value = "DROP TABLE sales_orders"
    mock_validate.side_effect = SqlValidationError("Only SELECT statements are allowed")

    with pytest.raises(SqlValidationError):
        await run_sales_query("question")


@patch("app.sql.service.execute_readonly_query", new_callable=AsyncMock)
@patch("app.sql.service.validate_and_rewrite")
@patch("app.sql.service.generate_sql", new_callable=AsyncMock)
async def test_run_sales_query_propagates_an_execution_error(mock_generate, mock_validate, mock_execute):
    mock_generate.return_value = "SELECT COUNT(*) FROM sales_orders"
    mock_validate.return_value = "SELECT COUNT(*) FROM sales_orders LIMIT 100"
    mock_execute.side_effect = SqlExecutionError("The query could not be executed")

    with pytest.raises(SqlExecutionError):
        await run_sales_query("question")
