from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.rag.types import RetrievedChunk
from app.tools import search_tool
from app.tools.registry import ToolRegistry
from app.tools.types import ToolContext


def _context(role: str = "EMPLOYEE") -> ToolContext:
    return ToolContext(organization_id=uuid4(), user_id=uuid4(), role=role)


def _registry() -> ToolRegistry:
    registry = ToolRegistry()
    search_tool.register_all(registry)
    return registry


def _make_chunk(**overrides) -> RetrievedChunk:
    defaults = dict(
        chunk_id=uuid4(),
        document_id=uuid4(),
        filename="policy.pdf",
        content="Refunds are issued within 30 days.",
        page_number=4,
        score=0.9123,
    )
    defaults.update(overrides)
    return RetrievedChunk(**defaults)


async def test_search_documents_returns_excerpts_with_citations():
    org_id = uuid4()
    chunk = _make_chunk()
    with patch("app.tools.search_tool.embed_query", new_callable=AsyncMock) as mock_embed, patch(
        "app.tools.search_tool.retrieve_top_chunks", new_callable=AsyncMock
    ) as mock_retrieve:
        mock_embed.return_value = [0.1, 0.2]
        mock_retrieve.return_value = [chunk]

        result = await _registry().execute(
            "search_documents",
            {"query": "What is the refund policy?"},
            ToolContext(organization_id=org_id, user_id=uuid4(), role="EMPLOYEE"),
        )

    assert result.ok is True
    assert result.data["query"] == "What is the refund policy?"
    assert result.data["results"] == [
        {
            "documentId": str(chunk.document_id),
            "chunkId": str(chunk.chunk_id),
            "filename": "policy.pdf",
            "page": 4,
            "score": 0.9123,
            "content": "Refunds are issued within 30 days.",
        }
    ]
    # Tenant context comes from ToolContext, not from the model's arguments.
    mock_retrieve.assert_awaited_once()
    assert mock_retrieve.await_args.args[0] == org_id


async def test_search_documents_is_available_to_every_role():
    with patch("app.tools.search_tool.embed_query", new_callable=AsyncMock) as mock_embed, patch(
        "app.tools.search_tool.retrieve_top_chunks", new_callable=AsyncMock
    ) as mock_retrieve:
        mock_embed.return_value = [0.1]
        mock_retrieve.return_value = []

        for role in ("ADMIN", "MANAGER", "EMPLOYEE"):
            result = await _registry().execute("search_documents", {"query": "q"}, _context(role=role))
            assert result.ok is True


async def test_search_documents_rejects_an_empty_query():
    result = await _registry().execute("search_documents", {"query": ""}, _context())

    assert result.ok is False
    assert result.error_code == "invalid_arguments"


async def test_search_documents_rejects_max_results_above_the_hard_cap():
    result = await _registry().execute("search_documents", {"query": "q", "max_results": 100}, _context())

    assert result.ok is False
    assert result.error_code == "invalid_arguments"
