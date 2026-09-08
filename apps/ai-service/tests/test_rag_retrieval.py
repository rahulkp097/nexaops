from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.rag.retrieval import retrieve_top_chunks


def _make_fake_pool(rows):
    connection = MagicMock()
    connection.fetch = AsyncMock(return_value=rows)

    acquire_cm = MagicMock()
    acquire_cm.__aenter__ = AsyncMock(return_value=connection)
    acquire_cm.__aexit__ = AsyncMock(return_value=False)

    pool = MagicMock()
    pool.acquire.return_value = acquire_cm
    return pool, connection


@patch("app.rag.retrieval.get_pool")
async def test_query_filters_by_organization_id_on_both_tables(mock_get_pool):
    pool, connection = _make_fake_pool(rows=[])
    mock_get_pool.return_value = pool

    org_id = uuid4()
    await retrieve_top_chunks(org_id, [0.1, 0.2], top_k=8)

    sql, *params = connection.fetch.call_args[0]
    assert "dc.organization_id = $1" in sql
    assert "d.organization_id = $1" in sql
    assert params[0] == org_id


@patch("app.rag.retrieval.get_pool")
async def test_different_organization_ids_bind_different_params(mock_get_pool):
    pool_a, connection_a = _make_fake_pool(rows=[])
    pool_b, connection_b = _make_fake_pool(rows=[])

    org_a, org_b = uuid4(), uuid4()

    mock_get_pool.return_value = pool_a
    await retrieve_top_chunks(org_a, [0.1], top_k=8)
    mock_get_pool.return_value = pool_b
    await retrieve_top_chunks(org_b, [0.1], top_k=8)

    bound_org_a = connection_a.fetch.call_args[0][1]
    bound_org_b = connection_b.fetch.call_args[0][1]
    assert bound_org_a == org_a
    assert bound_org_b == org_b
    assert bound_org_a != bound_org_b


@patch("app.rag.retrieval.get_pool")
async def test_maps_rows_into_retrieved_chunks(mock_get_pool):
    document_id = uuid4()
    chunk_id = uuid4()
    row = {
        "chunk_id": chunk_id,
        "document_id": document_id,
        "filename": "policy.pdf",
        "content": "refunds are processed within 30 days",
        "page_number": 3,
        "score": 0.87,
    }
    pool, _connection = _make_fake_pool(rows=[row])
    mock_get_pool.return_value = pool

    result = await retrieve_top_chunks(uuid4(), [0.1], top_k=8)

    assert len(result) == 1
    assert result[0].chunk_id == chunk_id
    assert result[0].document_id == document_id
    assert result[0].filename == "policy.pdf"
    assert result[0].page_number == 3
    assert result[0].score == 0.87
