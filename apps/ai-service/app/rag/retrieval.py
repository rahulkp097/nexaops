import asyncio
import json
from typing import Any
from uuid import UUID

from pgvector import Vector

from app.core.db import get_pool
from app.rag.fusion import reciprocal_rank_fusion
from app.rag.keyword_search import search_by_keyword
from app.rag.types import RetrievedChunk

# organization_id is filtered on both document_chunks (denormalized for
# exactly this query, spec §14) and documents — defense in depth per
# spec §8 ("Apply tenant filtering to vector retrieval") against any
# future data-integrity drift between the two columns. metadata @>
# '{}'::jsonb is always true, so "no filter" and "a real filter" are the
# same code path (see keyword_search.py for the same trick).
_VECTOR_QUERY = """
    SELECT dc.id AS chunk_id, dc.document_id, d.filename, dc.content, dc.page_number,
           1 - (dc.embedding <=> $2) AS score
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE dc.organization_id = $1 AND d.organization_id = $1
      AND dc.metadata @> $4::jsonb
    ORDER BY dc.embedding <=> $2
    LIMIT $3
"""


async def search_by_vector(
    organization_id: UUID,
    query_embedding: list[float],
    limit: int,
    metadata_filter: dict[str, Any] | None = None,
) -> list[RetrievedChunk]:
    pool = get_pool()
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            _VECTOR_QUERY,
            organization_id,
            Vector(query_embedding),
            limit,
            json.dumps(metadata_filter or {}),
        )
    return [RetrievedChunk.from_row(row) for row in rows]


async def retrieve_top_chunks(
    organization_id: UUID,
    query_text: str,
    query_embedding: list[float],
    top_k: int,
    candidate_pool_size: int,
    metadata_filter: dict[str, Any] | None = None,
) -> list[RetrievedChunk]:
    """Hybrid retrieval: each method independently fetches a wider
    candidate pool, then Reciprocal Rank Fusion merges the two ranked
    lists by position (cosine similarity and ts_rank aren't on
    comparable scales, but ranks always are) and trims to the final
    top_k passed to the LLM."""
    vector_results, keyword_results = await asyncio.gather(
        search_by_vector(organization_id, query_embedding, candidate_pool_size, metadata_filter),
        search_by_keyword(
            organization_id, query_text, query_embedding, candidate_pool_size, metadata_filter
        ),
    )
    return reciprocal_rank_fusion([vector_results, keyword_results], top_k=top_k)
