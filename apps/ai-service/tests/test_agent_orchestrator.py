import asyncio
import json
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.agents.orchestrator import run_agent
from app.core.schemas import HistoryMessageDto
from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.llm_client import MessageResult, ToolUseRequest
from app.tools.registry import registry
from app.tools.types import ToolCallResult, ToolContext


def _context(role: str = "MANAGER") -> ToolContext:
    return ToolContext(organization_id=uuid4(), user_id=uuid4(), role=role)


def _text_result(text: str, stop_reason: str = "end_turn", input_tokens=10, output_tokens=10) -> MessageResult:
    return MessageResult(
        stop_reason=stop_reason,
        text=text,
        tool_uses=[],
        raw_content=[{"type": "text", "text": text}],
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


def _tool_use_result(name: str, tool_input: dict, tool_use_id: str = "toolu_1", text: str = "") -> MessageResult:
    raw = ([{"type": "text", "text": text}] if text else []) + [
        {"type": "tool_use", "id": tool_use_id, "name": name, "input": tool_input}
    ]
    return MessageResult(
        stop_reason="tool_use",
        text=text,
        tool_uses=[ToolUseRequest(id=tool_use_id, name=name, input=tool_input)],
        raw_content=raw,
        input_tokens=50,
        output_tokens=20,
    )


async def test_answers_directly_when_no_tool_is_needed():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = _text_result("The answer is 42.")

        result = await run_agent("What is the answer?", _context())

    assert result.answer == "The answer is 42."
    assert result.stopped_reason == "end_turn"
    assert result.iterations == 1
    assert result.tool_calls == []


async def test_history_is_prepended_before_the_new_question():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = _text_result("ok")
        history = [HistoryMessageDto(role="user", content="Hi"), HistoryMessageDto(role="assistant", content="Hello!")]

        await run_agent("Follow-up?", _context(), history=history)

    messages = mock_create.call_args.kwargs["messages"]
    assert messages[0] == {"role": "user", "content": "Hi"}
    assert messages[1] == {"role": "assistant", "content": "Hello!"}
    assert messages[2] == {"role": "user", "content": "Follow-up?"}


async def test_conversation_summary_is_forwarded_into_the_system_prompt():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = _text_result("ok")

        await run_agent(
            "Follow-up?", _context(), conversation_summary="The user previously asked about order 10291."
        )

    system_prompt = mock_create.call_args.kwargs["system"]
    assert "The user previously asked about order 10291." in system_prompt


async def test_executes_a_requested_tool_and_feeds_the_result_back():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create, patch.object(
        registry, "execute", new_callable=AsyncMock
    ) as mock_execute:
        mock_create.side_effect = [
            _tool_use_result("get_order", {"order_id": "10291"}, text="Let me check."),
            _text_result("Order 10291 is delayed."),
        ]
        mock_execute.return_value = ToolCallResult(ok=True, data={"found": True, "status": "DELAYED"})

        result = await run_agent("Why was order 10291 delayed?", _context())

    assert result.answer == "Order 10291 is delayed."
    assert result.iterations == 2
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].name == "get_order"
    assert result.tool_calls[0].arguments == {"order_id": "10291"}
    assert result.tool_calls[0].ok is True
    assert result.tool_calls[0].result == {"found": True, "status": "DELAYED"}

    assert mock_execute.call_args.args[0] == "get_order"
    assert mock_execute.call_args.args[1] == {"order_id": "10291"}
    assert isinstance(mock_execute.call_args.args[2], ToolContext)
    # The assistant's tool_use turn and the tool_result turn were both appended.
    second_call_messages = mock_create.call_args_list[1].kwargs["messages"]
    assert second_call_messages[-2]["role"] == "assistant"
    assert second_call_messages[-1]["role"] == "user"
    tool_result_block = second_call_messages[-1]["content"][0]
    assert tool_result_block["type"] == "tool_result"
    assert tool_result_block["tool_use_id"] == "toolu_1"
    assert json.loads(tool_result_block["content"]) == {"found": True, "status": "DELAYED"}


async def test_a_failed_tool_call_is_fed_back_as_error_data_not_raised():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create, patch.object(
        registry, "execute", new_callable=AsyncMock
    ) as mock_execute:
        mock_create.side_effect = [
            _tool_use_result("get_order", {"order_id": "99999"}),
            _text_result("I couldn't find that order."),
        ]
        mock_execute.return_value = ToolCallResult(ok=False, error_code="tool_not_found", error_message="No such tool")

        result = await run_agent("What about order 99999?", _context())

    assert result.answer == "I couldn't find that order."
    assert result.tool_calls[0].ok is False
    assert result.tool_calls[0].error_code == "tool_not_found"
    tool_result_content = mock_create.call_args_list[1].kwargs["messages"][-1]["content"][0]["content"]
    assert json.loads(tool_result_content) == {"error": "tool_not_found", "message": "No such tool"}


async def test_multiple_tool_uses_in_one_turn_are_all_executed_and_answered():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create, patch.object(
        registry, "execute", new_callable=AsyncMock
    ) as mock_execute:
        multi_tool_result = MessageResult(
            stop_reason="tool_use",
            text="",
            tool_uses=[
                ToolUseRequest(id="toolu_1", name="get_order", input={"order_id": "10291"}),
                ToolUseRequest(id="toolu_2", name="search_documents", input={"query": "delay policy"}),
            ],
            raw_content=[
                {"type": "tool_use", "id": "toolu_1", "name": "get_order", "input": {"order_id": "10291"}},
                {"type": "tool_use", "id": "toolu_2", "name": "search_documents", "input": {"query": "delay policy"}},
            ],
            input_tokens=50,
            output_tokens=20,
        )
        mock_create.side_effect = [multi_tool_result, _text_result("Combined answer.")]
        mock_execute.return_value = ToolCallResult(ok=True, data={"ok": "yes"})

        result = await run_agent("Why delayed and what's the policy?", _context())

    assert mock_execute.await_count == 2
    assert len(result.tool_calls) == 2
    assert {call.name for call in result.tool_calls} == {"get_order", "search_documents"}
    tool_results = mock_create.call_args_list[1].kwargs["messages"][-1]["content"]
    assert len(tool_results) == 2
    assert {block["tool_use_id"] for block in tool_results} == {"toolu_1", "toolu_2"}


async def test_identical_repeated_tool_calls_are_served_from_cache_not_re_executed():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create, patch.object(
        registry, "execute", new_callable=AsyncMock
    ) as mock_execute:
        mock_create.side_effect = [
            _tool_use_result("get_order", {"order_id": "10291"}, tool_use_id="toolu_1"),
            _tool_use_result("get_order", {"order_id": "10291"}, tool_use_id="toolu_2"),
            _text_result("Done."),
        ]
        mock_execute.return_value = ToolCallResult(ok=True, data={"status": "DELAYED"})

        result = await run_agent("question", _context())

    mock_execute.assert_awaited_once()  # only the first call actually executed
    assert len(result.tool_calls) == 2  # both requests are still recorded in the trace
    assert all(call.result == {"status": "DELAYED"} for call in result.tool_calls)


async def test_stops_after_max_iterations_when_the_model_keeps_requesting_tools():
    with patch("app.agents.orchestrator.get_settings") as mock_settings, patch(
        "app.agents.orchestrator.create_message", new_callable=AsyncMock
    ) as mock_create, patch.object(registry, "execute", new_callable=AsyncMock) as mock_execute:
        mock_settings.return_value.agent_max_iterations = 3
        mock_settings.return_value.agent_max_tool_calls = 100
        mock_settings.return_value.agent_max_total_tokens = 1_000_000
        mock_settings.return_value.agent_timeout_seconds = 60.0
        mock_settings.return_value.agent_max_tokens_per_turn = 512

        # Always requests a (different, to dodge the cache) tool — never finishes on its own.
        mock_create.side_effect = [
            _tool_use_result("get_order", {"order_id": str(i)}, tool_use_id=f"toolu_{i}") for i in range(1, 4)
        ]
        mock_execute.return_value = ToolCallResult(ok=True, data={})

        result = await run_agent("question", _context())

    assert result.stopped_reason == "max_iterations"
    assert result.iterations == 3
    assert mock_create.await_count == 3
    # The final (3rd) call must not have offered any tools — it's the last
    # allowed iteration, so it should have forced a text-only completion;
    # the model in this test ignores that and requests a tool anyway
    # (there being nothing to call), which is exactly why the loop still
    # ends via the iteration bound rather than a clean stop_reason.
    assert mock_create.call_args_list[2].kwargs["tools"] is None


async def test_stops_offering_tools_once_the_tool_call_budget_is_exhausted():
    with patch("app.agents.orchestrator.get_settings") as mock_settings, patch(
        "app.agents.orchestrator.create_message", new_callable=AsyncMock
    ) as mock_create, patch.object(registry, "execute", new_callable=AsyncMock) as mock_execute:
        mock_settings.return_value.agent_max_iterations = 5
        mock_settings.return_value.agent_max_tool_calls = 1
        mock_settings.return_value.agent_max_total_tokens = 1_000_000
        mock_settings.return_value.agent_timeout_seconds = 60.0
        mock_settings.return_value.agent_max_tokens_per_turn = 512

        mock_create.side_effect = [
            _tool_use_result("get_order", {"order_id": "1"}, tool_use_id="toolu_1"),
            _text_result("Wrapping up."),
        ]
        mock_execute.return_value = ToolCallResult(ok=True, data={})

        result = await run_agent("question", _context())

    assert result.answer == "Wrapping up."
    mock_execute.assert_awaited_once()  # budget of 1 was used exactly once
    # Second create_message call must have had no tools offered (budget used up).
    assert mock_create.call_args_list[1].kwargs["tools"] is None


async def test_a_same_turn_overflow_beyond_the_tool_call_budget_is_reported_without_executing():
    with patch("app.agents.orchestrator.get_settings") as mock_settings, patch(
        "app.agents.orchestrator.create_message", new_callable=AsyncMock
    ) as mock_create, patch.object(registry, "execute", new_callable=AsyncMock) as mock_execute:
        mock_settings.return_value.agent_max_iterations = 5
        mock_settings.return_value.agent_max_tool_calls = 1
        mock_settings.return_value.agent_max_total_tokens = 1_000_000
        mock_settings.return_value.agent_timeout_seconds = 60.0
        mock_settings.return_value.agent_max_tokens_per_turn = 512

        two_tool_result = MessageResult(
            stop_reason="tool_use",
            text="",
            tool_uses=[
                ToolUseRequest(id="toolu_1", name="get_order", input={"order_id": "1"}),
                ToolUseRequest(id="toolu_2", name="get_order", input={"order_id": "2"}),
            ],
            raw_content=[
                {"type": "tool_use", "id": "toolu_1", "name": "get_order", "input": {"order_id": "1"}},
                {"type": "tool_use", "id": "toolu_2", "name": "get_order", "input": {"order_id": "2"}},
            ],
            input_tokens=10,
            output_tokens=10,
        )
        mock_create.side_effect = [two_tool_result, _text_result("done")]
        mock_execute.return_value = ToolCallResult(ok=True, data={})

        result = await run_agent("question", _context())

    mock_execute.assert_awaited_once()  # only the first of the two ran
    error_calls = [c for c in result.tool_calls if c.error_code == "tool_call_budget_exceeded"]
    assert len(error_calls) == 1
    assert error_calls[0].arguments == {"order_id": "2"}


async def test_stops_on_timeout_when_a_call_runs_past_the_deadline():
    with patch("app.agents.orchestrator.get_settings") as mock_settings, patch(
        "app.agents.orchestrator.create_message", new_callable=AsyncMock
    ) as mock_create:
        mock_settings.return_value.agent_max_iterations = 5
        mock_settings.return_value.agent_max_tool_calls = 10
        mock_settings.return_value.agent_max_total_tokens = 1_000_000
        mock_settings.return_value.agent_timeout_seconds = 0.05
        mock_settings.return_value.agent_max_tokens_per_turn = 512

        async def _slow(*_args, **_kwargs):
            await asyncio.sleep(10)

        mock_create.side_effect = _slow

        result = await run_agent("question", _context())

    assert result.stopped_reason == "timeout"


async def test_llm_unavailable_error_propagates_instead_of_being_swallowed():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create:
        mock_create.side_effect = LlmUnavailableError("rate limited")

        with pytest.raises(LlmUnavailableError):
            await run_agent("question", _context())


async def test_llm_request_error_propagates_instead_of_being_swallowed():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create:
        mock_create.side_effect = LlmRequestError("bad key")

        with pytest.raises(LlmRequestError):
            await run_agent("question", _context())


async def test_offers_only_the_tools_allowed_for_the_caller_role():
    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create, patch.object(
        registry, "to_anthropic_tools", wraps=registry.to_anthropic_tools
    ) as mock_to_tools:
        mock_create.return_value = _text_result("ok")

        await run_agent("question", _context(role="EMPLOYEE"))

    mock_to_tools.assert_called_once_with(role="EMPLOYEE")
