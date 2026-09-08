import json
from typing import Any
from uuid import UUID

from pgvector import Vector

from app.core.db import get_pool
from app.rag.types import RetrievedChunk

# Ranked by ts_rank (keyword relevance), but score is the same cosine
# similarity expression the vector query uses — score stays a single,
# consistent metric regardless of which search method found a chunk.
# The metadata @> '{}'::jsonb trick makes "no filter" and "a real
# filter" the same code path (empty JSONB object is contained in any
# object) — no dynamic SQL needed. organization_id is filtered on both
# tables per spec §8, same as the vector query.
_QUERY = """
    SELECT dc.id AS chunk_id, dc.document_id, d.filename, dc.content, dc.page_number,
           1 - (dc.embedding <=> $2) AS score
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE dc.organization_id = $1 AND d.organization_id = $1
      AND dc.metadata @> $5::jsonb
      AND to_tsvector('english', dc.content) @@ websearch_to_tsquery('english', $3)
    ORDER BY ts_rank(to_tsvector('english', dc.content), websearch_to_tsquery('english', $3)) DESC
    LIMIT $4
"""


async def search_by_keyword(
    organization_id: UUID,
    query_text: str,
    query_embedding: list[float],
    limit: int,
    metadata_filter: dict[str, Any] | None = None,
) -> list[RetrievedChunk]:
    pool = get_pool()
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            _QUERY,
            organization_id,
            Vector(query_embedding),
            query_text,
            limit,
            json.dumps(metadata_filter or {}),
        )
    return [RetrievedChunk.from_row(row) for row in rows]
