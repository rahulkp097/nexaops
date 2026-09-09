from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.sql.errors import SqlValidationError
from app.sql.types import SqlQueryResult
from app.tools import sql_tool
from app.tools.registry import ToolRegistry
from app.tools.types import ToolContext


def _context(role: str = "MANAGER") -> ToolContext:
    return ToolContext(organization_id=uuid4(), user_id=uuid4(), role=role)


def _registry() -> ToolRegistry:
    registry = ToolRegistry()
    sql_tool.register_all(registry)
    return registry


async def test_run_sales_query_returns_the_structured_result_on_success():
    context = _context()
    with patch("app.tools.sql_tool.run_sales_query", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = SqlQueryResult(
            sql="SELECT COUNT(*) AS count FROM sales_orders LIMIT 100",
            rows=[{"count": 32}],
            row_count=1,
        )
        result = await _registry().execute("run_sales_query", {"question": "How many orders?"}, context)

    assert result.ok is True
    assert result.data == {
        "answered": True,
        "sql": "SELECT COUNT(*) AS count FROM sales_orders LIMIT 100",
        "rows": [{"count": 32}],
        "rowCount": 1,
    }
    mock_run.assert_awaited_once_with("How many orders?", context.organization_id)


async def test_run_sales_query_returns_answered_false_on_a_controlled_failure_not_a_tool_error():
    with patch("app.tools.sql_tool.run_sales_query", new_callable=AsyncMock) as mock_run:
        mock_run.side_effect = SqlValidationError("Table not allowed: users")
        result = await _registry().execute("run_sales_query", {"question": "Show me all users"}, _context())

    assert result.ok is True
    assert result.data == {"answered": False, "reason": "Table not allowed: users"}


async def test_run_sales_query_rejects_employee_role():
    result = await _registry().execute("run_sales_query", {"question": "How many orders?"}, _context(role="EMPLOYEE"))

    assert result.ok is False
    assert result.error_code == "unauthorized"


async def test_run_sales_query_rejects_an_empty_question():
    result = await _registry().execute("run_sales_query", {"question": ""}, _context())

    assert result.ok is False
    assert result.error_code == "invalid_arguments"
