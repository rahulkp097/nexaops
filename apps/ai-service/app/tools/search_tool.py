from typing import Any

from pydantic import BaseModel, Field

from app.rag.embeddings import embed_query
from app.rag.retrieval import retrieve_top_chunks
from app.tools.registry import ToolRegistry
from app.tools.types import ToolContext, ToolDefinition

# Unlike the business tools, every role gets document/chat access (spec
# §11: "EMPLOYEE: permitted chat/knowledge access").
_ALL_ROLES = frozenset({"ADMIN", "MANAGER", "EMPLOYEE"})

_DEFAULT_MAX_RESULTS = 8
_HARD_MAX_RESULTS = 20


class SearchDocumentsInput(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The natural-language question or topic to search the organization's documents for.",
    )
    max_results: int = Field(
        _DEFAULT_MAX_RESULTS,
        ge=1,
        le=_HARD_MAX_RESULTS,
        description="Maximum number of document excerpts to return.",
    )


async def _search_documents(input_model: SearchDocumentsInput, context: ToolContext) -> dict[str, Any]:
    # Tenant context comes from `context` (server-supplied), never from the
    # input schema above — the model has no field through which it could
    # supply or override an organization_id.
    query_embedding = await embed_query(input_model.query)
    chunks = await retrieve_top_chunks(
        context.organization_id,
        input_model.query,
        query_embedding,
        top_k=input_model.max_results,
        candidate_pool_size=max(input_model.max_results * 2, 20),
    )
    return {
        "query": input_model.query,
        "results": [
            {
                "documentId": str(chunk.document_id),
                "chunkId": str(chunk.chunk_id),
                "filename": chunk.filename,
                "page": chunk.page_number,
                "score": round(chunk.score, 4),
                "content": chunk.content,
            }
            for chunk in chunks
        ],
    }


def register_all(target: ToolRegistry) -> None:
    target.register(
        ToolDefinition(
            name="search_documents",
            description=(
                "Search the organization's uploaded documents for passages relevant to a "
                "question or topic. Returns raw excerpts with citations (document, page, "
                "relevance score), not a synthesized answer — read the excerpts and reason over "
                "them yourself. Only searches this organization's own documents; cannot search "
                "the web or any other organization's data."
            ),
            input_model=SearchDocumentsInput,
            handler=_search_documents,
            allowed_roles=_ALL_ROLES,
            timeout_seconds=10.0,
            max_result_bytes=32_000,
        )
    )
