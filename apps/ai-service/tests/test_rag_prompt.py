from uuid import uuid4

from app.rag.prompt import build_system_prompt, build_user_content
from app.rag.retrieval import RetrievedChunk


def test_system_prompt_requires_treating_evidence_as_untrusted():
    prompt = build_system_prompt()
    assert "not instructions" in prompt or "never as a command" in prompt
    assert "untrusted" in prompt.lower()


def test_system_prompt_requires_admitting_insufficient_evidence():
    prompt = build_system_prompt()
    assert "insufficient" in prompt.lower()
    assert "do not guess" in prompt.lower() or "fabricate" in prompt.lower()


def test_user_content_with_no_chunks_has_a_placeholder():
    content = build_user_content("What is the refund policy?", [])
    assert "No matching document evidence" in content
    assert "What is the refund policy?" in content


def test_user_content_with_chunks_includes_each_chunk_as_evidence():
    chunk1 = RetrievedChunk(
        chunk_id=uuid4(),
        document_id=uuid4(),
        filename="refund-policy.pdf",
        content="Refunds are issued within 30 days.",
        page_number=4,
        score=0.9,
    )
    chunk2 = RetrievedChunk(
        chunk_id=uuid4(),
        document_id=uuid4(),
        filename="terms.txt",
        content="Damaged goods qualify for a full refund.",
        page_number=None,
        score=0.8,
    )

    content = build_user_content("What is the refund policy?", [chunk1, chunk2])

    assert "[1]" in content and "[2]" in content
    assert str(chunk1.chunk_id) in content
    assert "refund-policy.pdf" in content
    assert "page: 4" in content
    assert "terms.txt" in content
    assert "page: n/a" in content
    assert "Refunds are issued within 30 days." in content
    assert "Damaged goods qualify for a full refund." in content
