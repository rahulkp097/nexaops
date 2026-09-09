from unittest.mock import AsyncMock, patch

import pytest

from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.sql.errors import SqlGenerationError
from app.sql.generator import generate_sql


async def test_generate_sql_returns_the_llm_output_verbatim():
    with patch("app.sql.generator.generate_answer", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = "SELECT order_id FROM sales_orders"

        result = await generate_sql("How many orders are there?")

    assert result == "SELECT order_id FROM sales_orders"
    mock_generate.assert_awaited_once()
    kwargs = mock_generate.call_args.kwargs
    assert kwargs["messages"] == [{"role": "user", "content": "Question: How many orders are there?"}]


async def test_generate_sql_wraps_llm_unavailable_error():
    with patch("app.sql.generator.generate_answer", new_callable=AsyncMock) as mock_generate:
        mock_generate.side_effect = LlmUnavailableError("rate limited")

        with pytest.raises(SqlGenerationError):
            await generate_sql("question")


async def test_generate_sql_wraps_llm_request_error():
    with patch("app.sql.generator.generate_answer", new_callable=AsyncMock) as mock_generate:
        mock_generate.side_effect = LlmRequestError("bad key")

        with pytest.raises(SqlGenerationError):
            await generate_sql("question")
