from fastapi import APIRouter, HTTPException

from app.memory.schemas import SummarizeConversationRequest, SummarizeConversationResponse
from app.memory.summarizer import summarize_conversation
from app.rag.errors import LlmRequestError, LlmUnavailableError

# Internal-only endpoint, same trust model as /rag/query and /agent/run: no
# authentication of its own — the caller (the gateway) must already have
# resolved the conversation and its messages from an authenticated request.
router = APIRouter(prefix="/memory", tags=["memory"])


@router.post("/summarize", response_model=SummarizeConversationResponse)
async def summarize(payload: SummarizeConversationRequest) -> SummarizeConversationResponse:
    try:
        summary = await summarize_conversation(payload.previous_summary, payload.messages)
    except LlmUnavailableError as exc:
        raise HTTPException(status_code=503, detail="AI provider temporarily unavailable") from exc
    except LlmRequestError as exc:
        raise HTTPException(status_code=502, detail="AI provider request failed") from exc

    return SummarizeConversationResponse(summary=summary)
