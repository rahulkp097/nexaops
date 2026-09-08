from dataclasses import dataclass
from uuid import UUID

from pgvector import Vector

from app.core.db import get_pool


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: UUID
    document_id: UUID
    filename: str
    content: str
    page_number: int | None
    score: float


# organization_id is filtered on both document_chunks (denormalized for
# exactly this query, spec §14) and documents — defense in depth per
# spec §8 ("Apply tenant filtering to vector retrieval") against any
# future data-integrity drift between the two columns.
_QUERY = """
    SELECT dc.id AS chunk_id, dc.document_id, d.filename, dc.content, dc.page_number,
           1 - (dc.embedding <=> $2) AS score
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE dc.organization_id = $1 AND d.organization_id = $1
    ORDER BY dc.embedding <=> $2
    LIMIT $3
"""


async def retrieve_top_chunks(
    organization_id: UUID,
    query_embedding: list[float],
    top_k: int,
) -> list[RetrievedChunk]:
    pool = get_pool()
    async with pool.acquire() as connection:
        rows = await connection.fetch(_QUERY, organization_id, Vector(query_embedding), top_k)
    return [
        RetrievedChunk(
            chunk_id=row["chunk_id"],
            document_id=row["document_id"],
            filename=row["filename"],
            content=row["content"],
            page_number=row["page_number"],
            score=float(row["score"]),
        )
        for row in rows
    ]
