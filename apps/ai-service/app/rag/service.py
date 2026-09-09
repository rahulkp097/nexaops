import logging
import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.rag.embeddings import embed_query
from app.rag.llm_client import generate_answer, stream_answer
from app.rag.prompt import build_messages, build_system_prompt
from app.rag.retrieval import retrieve_top_chunks
from app.rag.schemas import HistoryMessageDto, RagQueryResponse, SourceDto
from app.rag.types import RagStreamEvent, RetrievedChunk

logger = logging.getLogger(__name__)


async def _retrieve_context(
    question: str,
    organization_id: UUID,
    metadata_filter: dict[str, Any] | None,
) -> tuple[list[RetrievedChunk], list[SourceDto]]:
    settings = get_settings()
    start = time.monotonic()
    query_embedding = await embed_query(question)
    chunks = await retrieve_top_chunks(
        organization_id,
        question,
        query_embedding,
        top_k=settings.rag_top_k,
        candidate_pool_size=settings.rag_candidate_pool_size,
        metadata_filter=metadata_filter,
    )
    duration_ms = round((time.monotonic() - start) * 1000, 1)
    # spec §27: "Retrieval latency. Number of retrieved chunks." — never the
    # question text or chunk content itself, only counts/timing/ids.
    logger.info(
        "Retrieval completed: organization_id=%s chunks=%d duration_ms=%s", organization_id, len(chunks), duration_ms
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
    return chunks, sources


async def run_rag_query(
    question: str,
    organization_id: UUID,
    history: list[HistoryMessageDto] | None = None,
    metadata_filter: dict[str, Any] | None = None,
    conversation_summary: str | None = None,
) -> RagQueryResponse:
    settings = get_settings()
    chunks, sources = await _retrieve_context(question, organization_id, metadata_filter)

    # The LLM is always called, even with zero retrieved chunks: an
    # LLM-authored "insufficient evidence" admission (spec §15/§38) is
    # required either way, and a chunk-count check alone can't catch the
    # more common case of irrelevant-but-present chunks.
    answer = await generate_answer(
        system=build_system_prompt(conversation_summary),
        messages=build_messages(history or [], question, chunks),
        max_tokens=settings.rag_max_answer_tokens,
    )

    return RagQueryResponse(answer=answer, sources=sources)


async def stream_rag_query(
    question: str,
    organization_id: UUID,
    history: list[HistoryMessageDto] | None = None,
    metadata_filter: dict[str, Any] | None = None,
    conversation_summary: str | None = None,
) -> AsyncIterator[RagStreamEvent]:
    """Same pipeline as run_rag_query, as a stream of events instead of one
    blocking result: sources first (retrieval completes before the LLM call
    starts), then answer text deltas, then a final `done` event carrying the
    fully assembled answer for the caller to persist verbatim."""
    settings = get_settings()
    chunks, sources = await _retrieve_context(question, organization_id, metadata_filter)
    for source in sources:
        yield RagStreamEvent(event="source", data=source.model_dump(mode="json", by_alias=True))

    messages = build_messages(history or [], question, chunks)
    answer_parts: list[str] = []
    async for text in stream_answer(
        system=build_system_prompt(conversation_summary),
        messages=messages,
        max_tokens=settings.rag_max_answer_tokens,
    ):
        answer_parts.append(text)
        yield RagStreamEvent(event="token", data={"text": text})

    # provider/model are echoed back so the caller (the gateway, persisting
    # messages.model/messages.provider) records exactly what actually
    # answered rather than duplicating this config on its own side.
    yield RagStreamEvent(
        event="done",
        data={
            "answer": "".join(answer_parts),
            "model": settings.ai_model,
            "provider": settings.ai_provider,
        },
    )
