from unittest.mock import AsyncMock, patch

from app.core.schemas import HistoryMessageDto
from app.memory.summarizer import SUMMARY_SYSTEM_PROMPT, build_summary_prompt, summarize_conversation


def test_build_summary_prompt_with_no_previous_summary_lists_the_turns():
    messages = [
        HistoryMessageDto(role="user", content="What is order 10291's status?"),
        HistoryMessageDto(role="assistant", content="It's delayed due to a parts shortage."),
    ]

    prompt = build_summary_prompt(None, messages)

    assert "User: What is order 10291's status?" in prompt
    assert "Assistant: It's delayed due to a parts shortage." in prompt
    assert "Existing summary" not in prompt


def test_build_summary_prompt_with_a_previous_summary_asks_to_extend_it():
    previous = "The user asked about order 10291, which is delayed."
    messages = [HistoryMessageDto(role="user", content="What about order 10450?")]

    prompt = build_summary_prompt(previous, messages)

    assert previous in prompt
    assert "User: What about order 10450?" in prompt
    assert "updated summary" in prompt.lower()


@patch("app.memory.summarizer.generate_answer", new_callable=AsyncMock)
async def test_summarize_conversation_calls_generate_answer_with_the_built_prompt(mock_generate):
    mock_generate.return_value = "The user asked about order 10291."
    messages = [HistoryMessageDto(role="user", content="What is order 10291's status?")]

    result = await summarize_conversation(None, messages)

    assert result == "The user asked about order 10291."
    mock_generate.assert_awaited_once()
    call = mock_generate.call_args
    assert "order 10291" in call.kwargs["messages"][0]["content"]
    assert call.kwargs["system"] == SUMMARY_SYSTEM_PROMPT
