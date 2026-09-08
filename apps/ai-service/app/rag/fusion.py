from uuid import UUID

from app.rag.types import RetrievedChunk

# Standard Reciprocal Rank Fusion constant (also Elasticsearch's default)
# — not sensitive to tuning at this scale, so it's a constant, not a
# config var.
DEFAULT_RRF_K = 60


def reciprocal_rank_fusion(
    ranked_lists: list[list[RetrievedChunk]],
    top_k: int,
    k: int = DEFAULT_RRF_K,
) -> list[RetrievedChunk]:
    """Merges multiple ranked lists by position, not raw score — vector
    cosine similarity and full-text ts_rank aren't on comparable scales,
    but ranks always are. A chunk appearing in more than one list
    accumulates a higher fused score, which is what makes this a real
    reranking step rather than a naive concatenation."""
    fused_scores: dict[UUID, float] = {}
    chunks_by_id: dict[UUID, RetrievedChunk] = {}

    for ranked_list in ranked_lists:
        for rank, chunk in enumerate(ranked_list, start=1):
            fused_scores[chunk.chunk_id] = fused_scores.get(chunk.chunk_id, 0.0) + 1.0 / (k + rank)
            chunks_by_id.setdefault(chunk.chunk_id, chunk)

    ordered_ids = sorted(fused_scores, key=lambda chunk_id: fused_scores[chunk_id], reverse=True)
    return [chunks_by_id[chunk_id] for chunk_id in ordered_ids[:top_k]]
