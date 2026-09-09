import hashlib
import logging
import time
from dataclasses import asdict
from uuid import UUID

from app.core.cache import build_cache_key, get_cached, set_cached
from app.core.config import get_settings
from app.sql.errors import SqlValidationError
from app.sql.executor import execute_readonly_query
from app.sql.generator import generate_sql
from app.sql.prompt import SQL_PROMPT_VERSION
from app.sql.types import SqlQueryResult
from app.sql.validator import validate_and_rewrite

logger = logging.getLogger(__name__)


def _cache_key(organization_id: UUID, question: str) -> str:
    settings = get_settings()
    # Keyed on the model and SQL_PROMPT_VERSION alongside the question
    # (spec §29: "Include model/prompt/retrieval version in AI-cache keys
    # when necessary") — changing either invalidates every previously
    # cached answer instead of serving SQL generated under different
    # semantics. The question itself is hashed only to keep the key short
    # and free of characters Redis keys would rather not carry verbatim.
    question_hash = hashlib.sha256(question.encode()).hexdigest()
    return build_cache_key(organization_id, "sql", settings.ai_model, SQL_PROMPT_VERSION, question_hash)


async def run_sales_query(question: str, organization_id: UUID) -> SqlQueryResult:
    """The full spec §21 pipeline: natural language -> LLM-generated SQL ->
    parser/validator -> read-only execution -> structured result. Returns
    the raw rows and the SQL that was actually run, not a synthesized
    natural-language answer — same as app.tools.search_tool, the caller
    (eventually the Phase 13 agent loop) reads the structured data and
    explains it, rather than this pipeline doing that itself.

    A cache hit (spec §29) skips generate_sql entirely — the expensive,
    billed step — not just the database round trip."""
    cache_key = _cache_key(organization_id, question)
    cached = await get_cached(cache_key)
    if cached is not None:
        return SqlQueryResult(**cached)

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

    result = SqlQueryResult(sql=safe_sql, rows=rows, row_count=len(rows))
    await set_cached(cache_key, asdict(result), get_settings().cache_ttl_seconds)
    return result
