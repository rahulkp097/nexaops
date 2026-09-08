from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.rag.embeddings import embed_query
from app.rag.llm_client import generate_answer
from app.rag.prompt import build_system_prompt, build_user_content
from app.rag.retrieval import retrieve_top_chunks
from app.rag.schemas import RagQueryResponse, SourceDto


async def run_rag_query(
    question: str,
    organization_id: UUID,
    metadata_filter: dict[str, Any] | None = None,
) -> RagQueryResponse:
    settings = get_settings()

    query_embedding = await embed_query(question)
    chunks = await retrieve_top_chunks(
        organization_id,
        question,
        query_embedding,
        top_k=settings.rag_top_k,
        candidate_pool_size=settings.rag_candidate_pool_size,
        metadata_filter=metadata_filter,
    )

    # The LLM is always called, even with zero retrieved chunks: an
    # LLM-authored "insufficient evidence" admission (spec §15/§38) is
    # required either way, and a chunk-count check alone can't catch the
    # more common case of irrelevant-but-present chunks.
    answer = await generate_answer(
        system=build_system_prompt(),
        user_content=build_user_content(question, chunks),
        max_tokens=settings.rag_max_answer_tokens,
    )

    # sources is a direct 1:1 map of the retrieved chunks — never parsed
    # out of the model's prose — so it can never drift from what the
    # model actually saw as evidence.
    sources = [
        SourceDto(
            document_id=chunk.document_id,
            chunk_id=chunk.chunk_id,
            filename=chunk.filename,
            page=chunk.page_number,
            score=round(chunk.score, 4),
        )
        for chunk in chunks
    ]

    return RagQueryResponse(answer=answer, sources=sources)
