import logging
import time

from app.sql.errors import SqlValidationError
from app.sql.executor import execute_readonly_query
from app.sql.generator import generate_sql
from app.sql.types import SqlQueryResult
from app.sql.validator import validate_and_rewrite

logger = logging.getLogger(__name__)


async def run_sales_query(question: str) -> SqlQueryResult:
    """The full spec §21 pipeline: natural language -> LLM-generated SQL ->
    parser/validator -> read-only execution -> structured result. Returns
    the raw rows and the SQL that was actually run, not a synthesized
    natural-language answer — same as app.tools.search_tool, the caller
    (eventually the Phase 13 agent loop) reads the structured data and
    explains it, rather than this pipeline doing that itself."""
    generated_sql = await generate_sql(question)

    start = time.monotonic()
    try:
        safe_sql = validate_and_rewrite(generated_sql)
    except SqlValidationError as exc:
        # spec §27: "Error type/retry" — the rejection reason names only
        # schema-allowlist facts (table/column/function names), never the
        # model's full generated text, so this is safe to log at this level.
        logger.warning("Generated SQL rejected by validator: %s", exc)
        raise

    rows = await execute_readonly_query(safe_sql)
    duration_ms = round((time.monotonic() - start) * 1000, 1)
    logger.info("SQL query executed: rows=%d duration_ms=%s", len(rows), duration_ms)
    return SqlQueryResult(sql=safe_sql, rows=rows, row_count=len(rows))
