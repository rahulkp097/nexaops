import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.schemas import RagQueryRequest, RagQueryResponse
from app.rag.service import run_rag_query, stream_rag_query

# Internal-only endpoint: no authentication of its own. Tenant isolation
# depends entirely on the caller (the gateway, from Phase 8 onward) having
# already resolved organization_id from an authenticated request context
# — this service must never be reachable directly by an untrusted client.
# Same trust model as services/document-worker, which also has no auth on
# its own HTTP surface.
router = APIRouter(prefix="/rag", tags=["rag"])

logger = logging.getLogger(__name__)


@router.post("/query", response_model=RagQueryResponse)
async def query(payload: RagQueryRequest) -> RagQueryResponse:
    try:
        return await run_rag_query(
            payload.question,
            payload.organization_id,
            payload.history,
            payload.metadata_filter,
            payload.conversation_summary,
        )
    except LlmUnavailableError as exc:
        raise HTTPException(status_code=503, detail="AI provider temporarily unavailable") from exc
    except LlmRequestError as exc:
        raise HTTPException(status_code=502, detail="AI provider request failed") from exc


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/query/stream")
async def query_stream(payload: RagQueryRequest) -> StreamingResponse:
    async def event_source():
        try:
            async for evt in stream_rag_query(
                payload.question,
                payload.organization_id,
                payload.history,
                payload.metadata_filter,
                payload.conversation_summary,
            ):
                yield _sse(evt.event, evt.data)
        except LlmUnavailableError as exc:
            # Once streaming has started, an HTTP status code can no longer
            # be set — errors become an `error` SSE event instead (the
            # gateway maps this back to its own client-facing error event).
            yield _sse("error", {"message": "AI provider temporarily unavailable", "retryable": True})
            logger.warning("RAG stream aborted: AI provider unavailable: %s", exc)
        except LlmRequestError as exc:
            yield _sse("error", {"message": "AI provider request failed", "retryable": False})
            logger.warning("RAG stream aborted: AI provider request failed: %s", exc)
        except Exception:
            yield _sse("error", {"message": "Unexpected error while answering the question", "retryable": False})
            logger.exception("RAG stream aborted by an unexpected error")

    return StreamingResponse(event_source(), media_type="text/event-stream")
