import pytest

from app.sql.errors import SqlValidationError
from app.sql.validator import validate_and_rewrite


def test_allows_a_simple_select_and_injects_a_limit():
    result = validate_and_rewrite("SELECT order_id, total FROM sales_orders")

    assert "sales_orders" in result
    assert "LIMIT 100" in result


def test_allows_aggregate_functions_and_group_by():
    sql = "SELECT status, SUM(total) AS revenue FROM sales_orders GROUP BY status"
    result = validate_and_rewrite(sql)

    assert "SUM" in result


def test_allows_ordering_by_a_select_list_alias():
    sql = "SELECT status, SUM(total) AS revenue FROM sales_orders GROUP BY status ORDER BY revenue DESC"

    result = validate_and_rewrite(sql)  # must not raise

    assert "ORDER BY revenue DESC" in result


def test_allows_count_star():
    result = validate_and_rewrite("SELECT COUNT(*) FROM sales_orders WHERE status = 'DELAYED'")

    assert "COUNT(*)" in result


def test_allows_a_multi_condition_where_clause_with_and_or():
    # Regression test: sqlglot models AND/OR as Func subclasses in this
    # version, which the function allowlist must account for explicitly —
    # found via live testing, not unit tests, since every other validator
    # test here only used a single WHERE condition.
    sql = (
        "SELECT total FROM sales_orders WHERE placed_at >= '2026-08-01'::date "
        "AND placed_at <= '2026-08-31'::date AND (status = 'DELIVERED' OR status = 'SHIPPED')"
    )

    validate_and_rewrite(sql)  # must not raise


def test_allows_date_functions_and_casts():
    sql = (
        "SELECT DATE_TRUNC('month', placed_at) AS month, SUM(total) FROM sales_orders "
        "WHERE placed_at >= '2026-08-01'::date GROUP BY 1"
    )

    validate_and_rewrite(sql)  # must not raise


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO sales_orders (order_id) VALUES ('x')",
        "UPDATE sales_orders SET total = 0",
        "DELETE FROM sales_orders WHERE order_id = '1'",
        "DROP TABLE sales_orders",
        "ALTER TABLE sales_orders ADD COLUMN x text",
        "TRUNCATE sales_orders",
    ],
)
def test_rejects_every_mutation_and_ddl_statement_type(sql):
    with pytest.raises(SqlValidationError):
        validate_and_rewrite(sql)


def test_rejects_a_disallowed_table():
    with pytest.raises(SqlValidationError, match="Table not allowed"):
        validate_and_rewrite("SELECT email FROM users")


def test_rejects_a_disallowed_table_inside_a_subquery():
    with pytest.raises(SqlValidationError, match="Table not allowed"):
        validate_and_rewrite("SELECT order_id FROM sales_orders WHERE customer_id IN (SELECT id::text FROM users)")


def test_rejects_a_disallowed_table_inside_a_union():
    with pytest.raises(SqlValidationError):
        validate_and_rewrite("SELECT order_id FROM sales_orders UNION SELECT email FROM users")


def test_rejects_a_disallowed_column():
    with pytest.raises(SqlValidationError, match="Column not allowed"):
        validate_and_rewrite("SELECT password_hash FROM sales_orders")


def test_rejects_bare_select_star():
    with pytest.raises(SqlValidationError, match="SELECT \\*"):
        validate_and_rewrite("SELECT * FROM sales_orders")


def test_rejects_a_qualified_star():
    with pytest.raises(SqlValidationError, match="SELECT \\*"):
        validate_and_rewrite("SELECT sales_orders.* FROM sales_orders")


def test_rejects_select_distinct_star():
    with pytest.raises(SqlValidationError, match="SELECT \\*"):
        validate_and_rewrite("SELECT DISTINCT * FROM sales_orders")


def test_rejects_a_disallowed_function():
    with pytest.raises(SqlValidationError, match="Function not allowed"):
        validate_and_rewrite("SELECT pg_sleep(10)")


def test_rejects_a_recognized_but_not_allowlisted_function():
    with pytest.raises(SqlValidationError, match="Function not allowed"):
        validate_and_rewrite("SELECT version()")


def test_rejects_statement_stacking():
    with pytest.raises(SqlValidationError, match="exactly one"):
        validate_and_rewrite("SELECT total FROM sales_orders; DROP TABLE sales_orders;")


def test_rejects_a_cte():
    with pytest.raises(SqlValidationError):
        validate_and_rewrite("WITH recent AS (SELECT * FROM sales_orders) SELECT * FROM recent")


def test_rejects_malformed_sql():
    with pytest.raises(SqlValidationError, match="did not parse"):
        validate_and_rewrite("not even sql !! @#")


def test_rejects_empty_input():
    with pytest.raises(SqlValidationError, match="no SQL"):
        validate_and_rewrite("   ")


def test_strips_markdown_code_fences():
    result = validate_and_rewrite("```sql\nSELECT order_id FROM sales_orders\n```")

    assert "sales_orders" in result


def test_strips_a_trailing_semicolon():
    result = validate_and_rewrite("SELECT order_id FROM sales_orders;")

    assert "sales_orders" in result


def test_overrides_an_oversized_limit_requested_by_the_model():
    result = validate_and_rewrite("SELECT order_id FROM sales_orders LIMIT 999999")

    assert "LIMIT 100" in result
    assert "999999" not in result


def test_a_line_comment_cannot_smuggle_a_second_statement():
    # The `--` genuinely comments out the rest of the line per SQL syntax —
    # this must parse as one clean, safe statement, not be rejected as an
    # injection attempt it isn't.
    result = validate_and_rewrite("SELECT total FROM sales_orders WHERE status = 'DELAYED' -- ; DROP TABLE x")

    assert "sales_orders" in result
