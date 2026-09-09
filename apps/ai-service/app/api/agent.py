from fastapi import APIRouter, HTTPException

from app.agents.orchestrator import run_agent
from app.agents.schemas import AgentRunRequest, AgentRunResponse, ToolCallTraceDto
from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.tools.types import ToolContext

# Internal-only endpoint, same trust model as /rag/query and /tools/execute:
# no authentication of its own — the caller must already have resolved
# organization_id/user_id/role from an authenticated request.
router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/run", response_model=AgentRunResponse)
async def run(payload: AgentRunRequest) -> AgentRunResponse:
    context = ToolContext(organization_id=payload.organization_id, user_id=payload.user_id, role=payload.role)
    try:
        result = await run_agent(payload.question, context, payload.history, payload.conversation_summary)
    except LlmUnavailableError as exc:
        raise HTTPException(status_code=503, detail="AI provider temporarily unavailable") from exc
    except LlmRequestError as exc:
        raise HTTPException(status_code=502, detail="AI provider request failed") from exc

    return AgentRunResponse(
        answer=result.answer,
        stopped_reason=result.stopped_reason,
        iterations=result.iterations,
        tool_calls=[
            ToolCallTraceDto(
                name=call.name, arguments=call.arguments, ok=call.ok, result=call.result, error_code=call.error_code
            )
            for call in result.tool_calls
        ],
    )
