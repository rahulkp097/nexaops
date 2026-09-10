import pytest

from app.sql.errors import SqlExecutionError
from app.sql.executor import execute_readonly_query
from app.sql.validator import validate_and_rewrite

# spec §30: "Question -> SQL tool -> database" against the real, seeded
# sales_orders table (Phase 12) and the real nexaops_readonly role — NL
# generation itself is skipped (needs real credits), same reasoning as
# Phase 17's SQL evaluation cases: this is testing the validator and the
# database boundary, not the model's phrasing.
pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]


async def test_an_allowlisted_query_executes_against_real_seeded_data():
    safe_sql = validate_and_rewrite("SELECT status, COUNT(*) AS order_count FROM sales_orders GROUP BY status")

    rows = await execute_readonly_query(safe_sql)

    assert len(rows) > 0
    assert all("status" in row and "order_count" in row for row in rows)


async def test_the_readonly_role_itself_rejects_a_write_even_bypassing_the_validator():
    """Defense in depth (spec §21, live-verified again here): even if
    validate_and_rewrite were somehow bypassed, the nexaops_readonly
    Postgres role can't write at all — this executes a DELETE directly
    against the real readonly connection, without going through the
    validator, to prove the database-level boundary holds on its own."""
    with pytest.raises(SqlExecutionError):
        await execute_readonly_query("DELETE FROM sales_orders WHERE order_id = '10291'")
