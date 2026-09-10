import pytest

from app.rag.service import _retrieve_context

# spec §30: "Question -> retrieval -> answer" and "Tenant isolation" —
# both against the real Postgres/pgvector stack, not mocks. The LLM
# ("-> answer") step is exercised elsewhere (test_agent_flagship_scenario.py,
# and every phase's own live verification) since it needs real credits;
# this covers the half that's fully testable today without any.
pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]


async def test_retrieval_ranks_the_semantically_relevant_chunk_first(org_factory, document_factory, chunk_factory):
    org_id = await org_factory("Retrieval Integration Org")
    document_id = await document_factory(org_id)
    await chunk_factory(document_id, org_id, "Refunds are issued within 30 days of purchase.", chunk_index=0)
    await chunk_factory(document_id, org_id, "Our warehouse is located in Springfield.", chunk_index=1)

    chunks, sources = await _retrieve_context("What is the refund policy?", org_id, None)

    assert len(chunks) > 0
    assert "30 days" in chunks[0].content
    assert sources[0].document_id == document_id


async def test_retrieval_never_returns_another_organizations_chunks(org_factory, document_factory, chunk_factory):
    org_a = await org_factory("Tenant Isolation Org A")
    org_b = await org_factory("Tenant Isolation Org B")
    doc_a = await document_factory(org_a)
    doc_b = await document_factory(org_b)
    await chunk_factory(doc_a, org_a, "Org A's refund policy allows returns within 30 days.")
    canary_content = "CONFIDENTIAL Org B refund policy: returns within 30 days, restocking fee applies."
    await chunk_factory(doc_b, org_b, canary_content)

    chunks, _sources = await _retrieve_context("What is the refund policy?", org_a, None)

    assert all(chunk.content != canary_content for chunk in chunks)
    assert all(chunk.document_id == doc_a for chunk in chunks)
