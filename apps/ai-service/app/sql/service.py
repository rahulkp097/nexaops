from app.sql.executor import execute_readonly_query
from app.sql.generator import generate_sql
from app.sql.types import SqlQueryResult
from app.sql.validator import validate_and_rewrite


async def run_sales_query(question: str) -> SqlQueryResult:
    """The full spec §21 pipeline: natural language -> LLM-generated SQL ->
    parser/validator -> read-only execution -> structured result. Returns
    the raw rows and the SQL that was actually run, not a synthesized
    natural-language answer — same as app.tools.search_tool, the caller
    (eventually the Phase 13 agent loop) reads the structured data and
    explains it, rather than this pipeline doing that itself."""
    generated_sql = await generate_sql(question)
    safe_sql = validate_and_rewrite(generated_sql)
    rows = await execute_readonly_query(safe_sql)
    return SqlQueryResult(sql=safe_sql, rows=rows, row_count=len(rows))
