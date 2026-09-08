from fastapi import APIRouter, HTTPException

from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.schemas import RagQueryRequest, RagQueryResponse
from app.rag.service import run_rag_query

# Internal-only endpoint: no authentication of its own. Tenant isolation
# depends entirely on the caller (the gateway, from Phase 8 onward) having
# already resolved organization_id from an authenticated request context
# — this service must never be reachable directly by an untrusted client.
# Same trust model as services/document-worker, which also has no auth on
# its own HTTP surface.
router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/query", response_model=RagQueryResponse)
async def query(payload: RagQueryRequest) -> RagQueryResponse:
    try:
        return await run_rag_query(payload.question, payload.organization_id, payload.metadata_filter)
    except LlmUnavailableError as exc:
        raise HTTPException(status_code=503, detail="AI provider temporarily unavailable") from exc
    except LlmRequestError as exc:
        raise HTTPException(status_code=502, detail="AI provider request failed") from exc
