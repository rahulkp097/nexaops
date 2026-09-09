from typing import Any

from pydantic import BaseModel, Field

from app.sql.errors import SqlToolError
from app.sql.service import run_sales_query
from app.tools.registry import ToolRegistry
from app.tools.types import ToolContext, ToolDefinition

# Same "operational knowledge and permitted analytics" boundary as
# query_sales/calculate_metric (Phase 11) — see app/tools/business_tools.py.
_OPERATIONAL_ROLES = frozenset({"ADMIN", "MANAGER"})


class RunSalesQueryInput(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="A natural-language analytics question about sales orders, e.g. "
        '"What was our revenue in August?" or "How many orders are delayed?".',
    )


async def _run_sales_query(input_model: RunSalesQueryInput, context: ToolContext) -> dict[str, Any]:
    try:
        result = await run_sales_query(input_model.question, context.organization_id)
    except SqlToolError as exc:
        # A controlled failure (spec §21) is a normal result for the model
        # to see and react to, not a tool-execution error — same reasoning
        # as {found: false} in app/tools/business_tools.py.
        return {"answered": False, "reason": str(exc)}
    return {"answered": True, "sql": result.sql, "rows": result.rows, "rowCount": result.row_count}


def register_all(target: ToolRegistry) -> None:
    target.register(
        ToolDefinition(
            name="run_sales_query",
            description=(
                "Answer a flexible analytics question about sales orders — revenue, order "
                "counts, averages, breakdowns by status/customer segment/date — by generating "
                "and safely executing a read-only SQL query. For a single already-known order's "
                "own detail (status, why it was delayed), use get_order instead; for a "
                "structured filter you already know the shape of, query_sales/calculate_metric "
                "may be simpler. Returns {answered: false, reason} if the question can't be "
                "safely answered this way."
            ),
            input_model=RunSalesQueryInput,
            handler=_run_sales_query,
            allowed_roles=_OPERATIONAL_ROLES,
            timeout_seconds=15.0,
            max_result_bytes=20_000,
        )
    )
