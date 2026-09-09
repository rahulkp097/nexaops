from uuid import uuid4

from app.rag.prompt import build_messages, build_system_prompt, build_user_content
from app.rag.retrieval import RetrievedChunk
from app.rag.schemas import HistoryMessageDto


def test_system_prompt_requires_treating_evidence_as_untrusted():
    prompt = build_system_prompt()
    assert "never instructions" in prompt or "never as a command" in prompt
    assert "untrusted" in prompt.lower()


def test_system_prompt_requires_system_instructions_to_take_priority_over_evidence():
    prompt = build_system_prompt()
    assert "priority" in prompt.lower()
    assert "retrieved_evidence" in prompt


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

    assert '<evidence index="1">' in content and '<evidence index="2">' in content
    assert content.count("</evidence>") == 2
    assert str(chunk1.chunk_id) in content
    assert "refund-policy.pdf" in content
    assert "page 4" in content
    assert "terms.txt" in content
    assert "Refunds are issued within 30 days." in content
    assert "Damaged goods qualify for a full refund." in content
    # The whole evidence section is wrapped in one outer delimiter too.
    assert content.startswith("Question: What is the refund policy?\n\n<retrieved_evidence>\n")
    assert content.endswith("\n</retrieved_evidence>")


def test_build_messages_with_no_history_has_a_single_user_turn():
    messages = build_messages([], "What is the refund policy?", [])

    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    assert "What is the refund policy?" in messages[0]["content"]


def test_build_messages_prepends_history_turns_as_is():
    history = [
        HistoryMessageDto(role="user", content="Hi there"),
        HistoryMessageDto(role="assistant", content="Hello! How can I help?"),
    ]

    messages = build_messages(history, "What is the refund policy?", [])

    assert messages[0] == {"role": "user", "content": "Hi there"}
    assert messages[1] == {"role": "assistant", "content": "Hello! How can I help?"}
    assert messages[2]["role"] == "user"
    assert "What is the refund policy?" in messages[2]["content"]
    # Evidence is only ever attached to the current turn, never retrofitted
    # onto history.
    assert "<retrieved_evidence>" not in messages[0]["content"]
    assert "<retrieved_evidence>" not in messages[1]["content"]
