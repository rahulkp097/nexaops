from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.rag.keyword_search import search_by_keyword


def _make_fake_pool(rows):
    connection = MagicMock()
    connection.fetch = AsyncMock(return_value=rows)

    acquire_cm = MagicMock()
    acquire_cm.__aenter__ = AsyncMock(return_value=connection)
    acquire_cm.__aexit__ = AsyncMock(return_value=False)

    pool = MagicMock()
    pool.acquire.return_value = acquire_cm
    return pool, connection


@patch("app.rag.keyword_search.get_pool")
async def test_query_uses_websearch_to_tsquery_and_filters_tenant_on_both_tables(mock_get_pool):
    pool, connection = _make_fake_pool(rows=[])
    mock_get_pool.return_value = pool

    org_id = uuid4()
    await search_by_keyword(org_id, "SKU-12345", [0.1], limit=20)

    sql, *params = connection.fetch.call_args[0]
    assert "websearch_to_tsquery" in sql
    assert "ts_rank" in sql
    assert "dc.organization_id = $1" in sql
    assert "d.organization_id = $1" in sql
    assert params[0] == org_id
    assert params[2] == "SKU-12345"


@patch("app.rag.keyword_search.get_pool")
async def test_query_embedding_is_used_for_score_not_ranking(mock_get_pool):
    pool, connection = _make_fake_pool(rows=[])
    mock_get_pool.return_value = pool

    await search_by_keyword(uuid4(), "refund policy", [0.1, 0.2], limit=20)

    sql = connection.fetch.call_args[0][0]
    # score comes from the same cosine-similarity expression the vector
    # query uses, even though ORDER BY is ts_rank — keeps score
    # consistent across both search methods.
    assert "1 - (dc.embedding <=> $2)" in sql
    assert "ORDER BY ts_rank" in sql


@patch("app.rag.keyword_search.get_pool")
async def test_no_filter_defaults_to_empty_jsonb_object(mock_get_pool):
    pool, connection = _make_fake_pool(rows=[])
    mock_get_pool.return_value = pool

    await search_by_keyword(uuid4(), "question", [0.1], limit=20)

    params = connection.fetch.call_args[0][1:]
    assert params[-1] == "{}"


@patch("app.rag.keyword_search.get_pool")
async def test_metadata_filter_is_serialized_as_json(mock_get_pool):
    pool, connection = _make_fake_pool(rows=[])
    mock_get_pool.return_value = pool

    await search_by_keyword(
        uuid4(), "question", [0.1], limit=20, metadata_filter={"category": "policy"}
    )

    params = connection.fetch.call_args[0][1:]
    assert params[-1] == '{"category": "policy"}'


@patch("app.rag.keyword_search.get_pool")
async def test_maps_rows_into_retrieved_chunks(mock_get_pool):
    document_id = uuid4()
    chunk_id = uuid4()
    row = {
        "chunk_id": chunk_id,
        "document_id": document_id,
        "filename": "policy.pdf",
        "content": "order SKU-12345 was delayed",
        "page_number": None,
        "score": 0.42,
    }
    pool, _connection = _make_fake_pool(rows=[row])
    mock_get_pool.return_value = pool

    result = await search_by_keyword(uuid4(), "SKU-12345", [0.1], limit=20)

    assert len(result) == 1
    assert result[0].chunk_id == chunk_id
    assert result[0].filename == "policy.pdf"
    assert result[0].score == 0.42
