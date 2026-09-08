from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.rag.retrieval import retrieve_top_chunks, search_by_vector
from app.rag.types import RetrievedChunk


def _make_fake_pool(rows):
    connection = MagicMock()
    connection.fetch = AsyncMock(return_value=rows)

    acquire_cm = MagicMock()
    acquire_cm.__aenter__ = AsyncMock(return_value=connection)
    acquire_cm.__aexit__ = AsyncMock(return_value=False)

    pool = MagicMock()
    pool.acquire.return_value = acquire_cm
    return pool, connection


def _make_chunk(**overrides):
    defaults = dict(
        chunk_id=uuid4(),
        document_id=uuid4(),
        filename="doc.txt",
        content="content",
        page_number=None,
        score=0.5,
    )
    defaults.update(overrides)
    return RetrievedChunk(**defaults)


class TestSearchByVector:
    @patch("app.rag.retrieval.get_pool")
    async def test_filters_by_organization_id_on_both_tables(self, mock_get_pool):
        pool, connection = _make_fake_pool(rows=[])
        mock_get_pool.return_value = pool

        org_id = uuid4()
        await search_by_vector(org_id, [0.1, 0.2], limit=8)

        sql, *params = connection.fetch.call_args[0]
        assert "dc.organization_id = $1" in sql
        assert "d.organization_id = $1" in sql
        assert params[0] == org_id

    @patch("app.rag.retrieval.get_pool")
    async def test_no_filter_defaults_to_empty_jsonb_object(self, mock_get_pool):
        pool, connection = _make_fake_pool(rows=[])
        mock_get_pool.return_value = pool

        await search_by_vector(uuid4(), [0.1], limit=8)

        params = connection.fetch.call_args[0][1:]
        assert params[-1] == "{}"

    @patch("app.rag.retrieval.get_pool")
    async def test_metadata_filter_is_serialized_as_json(self, mock_get_pool):
        pool, connection = _make_fake_pool(rows=[])
        mock_get_pool.return_value = pool

        await search_by_vector(uuid4(), [0.1], limit=8, metadata_filter={"category": "policy"})

        params = connection.fetch.call_args[0][1:]
        assert params[-1] == '{"category": "policy"}'

    @patch("app.rag.retrieval.get_pool")
    async def test_maps_rows_into_retrieved_chunks(self, mock_get_pool):
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

        result = await search_by_vector(uuid4(), [0.1], limit=8)

        assert len(result) == 1
        assert result[0].chunk_id == chunk_id
        assert result[0].document_id == document_id
        assert result[0].filename == "policy.pdf"
        assert result[0].page_number == 3
        assert result[0].score == 0.87


class TestRetrieveTopChunks:
    @patch("app.rag.retrieval.search_by_keyword", new_callable=AsyncMock)
    @patch("app.rag.retrieval.search_by_vector", new_callable=AsyncMock)
    async def test_calls_both_searches_with_the_candidate_pool_size(
        self, mock_vector, mock_keyword
    ):
        mock_vector.return_value = []
        mock_keyword.return_value = []

        org_id = uuid4()
        await retrieve_top_chunks(org_id, "refund policy", [0.1], top_k=8, candidate_pool_size=20)

        mock_vector.assert_awaited_once_with(org_id, [0.1], 20, None)
        mock_keyword.assert_awaited_once_with(org_id, "refund policy", [0.1], 20, None)

    @patch("app.rag.retrieval.search_by_keyword", new_callable=AsyncMock)
    @patch("app.rag.retrieval.search_by_vector", new_callable=AsyncMock)
    async def test_fuses_and_trims_results_from_both_searches(self, mock_vector, mock_keyword):
        shared = _make_chunk()
        vector_only = _make_chunk()
        keyword_only = _make_chunk()

        mock_vector.return_value = [vector_only, shared]
        mock_keyword.return_value = [keyword_only, shared]

        result = await retrieve_top_chunks(
            uuid4(), "question", [0.1], top_k=2, candidate_pool_size=20
        )

        # shared appears in both lists, so RRF ranks it first regardless
        # of raw position in either individual list.
        assert len(result) == 2
        assert result[0].chunk_id == shared.chunk_id

    @patch("app.rag.retrieval.search_by_keyword", new_callable=AsyncMock)
    @patch("app.rag.retrieval.search_by_vector", new_callable=AsyncMock)
    async def test_metadata_filter_is_passed_to_both_searches(self, mock_vector, mock_keyword):
        mock_vector.return_value = []
        mock_keyword.return_value = []
        metadata_filter = {"category": "policy"}

        await retrieve_top_chunks(
            uuid4(),
            "question",
            [0.1],
            top_k=8,
            candidate_pool_size=20,
            metadata_filter=metadata_filter,
        )

        assert mock_vector.call_args[0][-1] == metadata_filter
        assert mock_keyword.call_args[0][-1] == metadata_filter
