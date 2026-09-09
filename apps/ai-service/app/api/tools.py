from fastapi import APIRouter

from app.tools.registry import registry
from app.tools.schemas import ToolExecuteRequest, ToolExecuteResponse
from app.tools.types import ToolContext

# Internal-only endpoint, same trust model as /rag/query (see api/rag.py):
# no authentication of its own — the caller must already have resolved
# organization_id/user_id/role from an authenticated request. This is the
# seam Phase 13's agent loop will call into; for now it also doubles as a
# way to exercise one tool call directly (e.g. for manual/integration
# testing) without a live LLM in the loop.
router = APIRouter(prefix="/tools", tags=["tools"])


@router.post("/execute", response_model=ToolExecuteResponse)
async def execute(payload: ToolExecuteRequest) -> ToolExecuteResponse:
    context = ToolContext(organization_id=payload.organization_id, user_id=payload.user_id, role=payload.role)
    result = await registry.execute(payload.tool, payload.arguments, context)
    return ToolExecuteResponse(
        ok=result.ok, data=result.data, error_code=result.error_code, error_message=result.error_message
    )
