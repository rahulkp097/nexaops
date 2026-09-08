from uuid import uuid4

from app.rag.fusion import DEFAULT_RRF_K, reciprocal_rank_fusion
from app.rag.types import RetrievedChunk


def _make_chunk(chunk_id=None, **overrides):
    defaults = dict(
        chunk_id=chunk_id or uuid4(),
        document_id=uuid4(),
        filename="doc.txt",
        content="content",
        page_number=None,
        score=0.5,
    )
    defaults.update(overrides)
    return RetrievedChunk(**defaults)


def test_empty_lists_produce_empty_result():
    assert reciprocal_rank_fusion([], top_k=8) == []
    assert reciprocal_rank_fusion([[], []], top_k=8) == []


def test_single_list_preserves_order():
    a, b, c = _make_chunk(), _make_chunk(), _make_chunk()
    result = reciprocal_rank_fusion([[a, b, c]], top_k=8)
    assert result == [a, b, c]


def test_top_k_truncates_the_fused_result():
    chunks = [_make_chunk() for _ in range(5)]
    result = reciprocal_rank_fusion([chunks], top_k=2)
    assert len(result) == 2
    assert result == chunks[:2]


def test_item_in_both_lists_outranks_item_in_only_one():
    shared = _make_chunk()
    vector_only = _make_chunk()
    keyword_only = _make_chunk()

    # shared ranks last in both lists, but appears in both — should still
    # win over items that rank first but appear in only one list, once
    # the pool is small enough for the "appears twice" bonus to dominate.
    vector_list = [vector_only, shared]
    keyword_list = [keyword_only, shared]

    result = reciprocal_rank_fusion([vector_list, keyword_list], top_k=3)

    assert result[0].chunk_id == shared.chunk_id


def test_exact_rrf_scores_for_a_known_example():
    a, b = _make_chunk(), _make_chunk()
    k = DEFAULT_RRF_K
    # a: rank 1 in list1 only -> 1/(k+1)
    # b: rank 1 in list2, rank 2 in list1 -> 1/(k+1) + 1/(k+2)
    result = reciprocal_rank_fusion([[b, a], [b]], top_k=2, k=k)

    expected_a = 1.0 / (k + 2)
    expected_b = 1.0 / (k + 1) + 1.0 / (k + 1)
    assert expected_b > expected_a
    assert result == [b, a]


def test_duplicate_chunk_is_counted_once_not_twice_in_output():
    shared = _make_chunk()
    other = _make_chunk()
    result = reciprocal_rank_fusion([[shared, other], [shared]], top_k=8)

    chunk_ids = [chunk.chunk_id for chunk in result]
    assert chunk_ids.count(shared.chunk_id) == 1
    assert len(result) == 2
