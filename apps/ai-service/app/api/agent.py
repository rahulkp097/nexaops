import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.agents.orchestrator import run_agent, run_agent_stream
from app.agents.schemas import AgentRunRequest, AgentRunResponse, ToolCallTraceDto
from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.tools.types import ToolContext

# Internal-only endpoint, same trust model as /rag/query and /tools/execute:
# no authentication of its own — the caller must already have resolved
# organization_id/user_id/role from an authenticated request.
router = APIRouter(prefix="/agent", tags=["agent"])

logger = logging.getLogger(__name__)


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


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/run/stream")
async def run_stream(payload: AgentRunRequest) -> StreamingResponse:
    """The endpoint the gateway's real chat flow calls (spec §22 wired into
    spec §17's chat, previously only reachable through the blocking /run
    above). Mirrors /rag/query/stream's pattern exactly: the generator
    (run_agent_stream) is wrapped by this route-level event_source(),
    which catches the domain errors *after* streaming has already started
    (an HTTP status code can no longer be set at that point) and turns
    them into an `error` SSE event instead — never letting an exception
    propagate out of StreamingResponse."""
    context = ToolContext(organization_id=payload.organization_id, user_id=payload.user_id, role=payload.role)

    async def event_source():
        try:
            async for evt in run_agent_stream(payload.question, context, payload.history, payload.conversation_summary):
                yield _sse(evt.event, evt.data)
        except LlmUnavailableError as exc:
            yield _sse("error", {"message": "AI provider temporarily unavailable", "retryable": True})
            logger.warning("Agent stream aborted: AI provider unavailable: %s", exc)
        except LlmRequestError as exc:
            yield _sse("error", {"message": "AI provider request failed", "retryable": False})
            logger.warning("Agent stream aborted: AI provider request failed: %s", exc)
        except Exception:
            yield _sse("error", {"message": "Unexpected error while answering the question", "retryable": False})
            logger.exception("Agent stream aborted by an unexpected error")

    return StreamingResponse(event_source(), media_type="text/event-stream")
