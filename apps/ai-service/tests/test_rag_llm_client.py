from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import pytest

from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.llm_client import ToolUseRequest, create_message, generate_answer, stream_answer


@pytest.fixture(autouse=True)
def _reset_client_singleton():
    import app.rag.llm_client as llm_client_module

    llm_client_module._client = None
    yield
    llm_client_module._client = None


async def test_blank_api_key_raises_llm_request_error_without_calling_the_sdk():
    with patch("app.rag.llm_client.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(ai_provider="anthropic", ai_api_key="")
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            with pytest.raises(LlmRequestError, match="AI_API_KEY is not configured"):
                await generate_answer("system", [{"role": "user", "content": "user content"}], max_tokens=100)
            mock_client_cls.assert_not_called()


async def test_unsupported_provider_raises_llm_request_error():
    with patch("app.rag.llm_client.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(ai_provider="openai", ai_api_key="sk-test")
        with pytest.raises(LlmRequestError, match="Unsupported AI provider"):
            await generate_answer("system", [{"role": "user", "content": "user content"}], max_tokens=100)


def _mock_settings():
    return MagicMock(ai_provider="anthropic", ai_api_key="sk-test", ai_model="claude-sonnet-5")


async def test_rate_limit_error_maps_to_llm_unavailable():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(
                side_effect=anthropic.RateLimitError(
                    "rate limited", response=MagicMock(status_code=429), body=None
                )
            )
            mock_client_cls.return_value = mock_client

            with pytest.raises(LlmUnavailableError):
                await generate_answer("system", [{"role": "user", "content": "user content"}], max_tokens=100)


async def test_server_error_maps_to_llm_unavailable():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(
                side_effect=anthropic.APIStatusError(
                    "server error", response=MagicMock(status_code=503), body=None
                )
            )
            mock_client_cls.return_value = mock_client

            with pytest.raises(LlmUnavailableError):
                await generate_answer("system", [{"role": "user", "content": "user content"}], max_tokens=100)


async def test_bad_request_maps_to_llm_request_error():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(
                side_effect=anthropic.APIStatusError(
                    "bad request", response=MagicMock(status_code=400), body=None
                )
            )
            mock_client_cls.return_value = mock_client

            with pytest.raises(LlmRequestError):
                await generate_answer("system", [{"role": "user", "content": "user content"}], max_tokens=100)


async def test_refusal_stop_reason_returns_safe_fallback_answer():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_response = MagicMock(stop_reason="refusal")
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            answer = await generate_answer("system", [{"role": "user", "content": "user content"}], max_tokens=100)
            assert "not able to answer" in answer.lower()


async def test_successful_response_extracts_text_blocks():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            text_block = MagicMock(type="text", text="Refunds are processed within 30 days.")
            mock_response = MagicMock(stop_reason="end_turn", content=[text_block])
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            answer = await generate_answer("system", [{"role": "user", "content": "user content"}], max_tokens=100)
            assert answer == "Refunds are processed within 30 days."


class _FakeTextStream:
    def __init__(self, chunks: list[str]):
        self._chunks = chunks

    def __aiter__(self):
        return self._generate()

    async def _generate(self):
        for chunk in self._chunks:
            yield chunk


class _FakeMessageStream:
    """Stands in for anthropic's AsyncMessageStream: an async context
    manager exposing `.text_stream` and `.get_final_message()`."""

    def __init__(self, chunks: list[str], stop_reason: str):
        self.text_stream = _FakeTextStream(chunks)
        self._final_message = MagicMock(stop_reason=stop_reason)

    async def get_final_message(self):
        return self._final_message

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc_info):
        return False


async def test_stream_answer_yields_each_text_delta():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.messages.stream = MagicMock(
                return_value=_FakeMessageStream(["Refunds ", "are ", "processed."], "end_turn")
            )
            mock_client_cls.return_value = mock_client

            chunks = [chunk async for chunk in stream_answer("system", [{"role": "user", "content": "q"}], max_tokens=100)]
            assert chunks == ["Refunds ", "are ", "processed."]


async def test_stream_answer_refusal_with_no_partial_text_yields_fallback():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.messages.stream = MagicMock(return_value=_FakeMessageStream([], "refusal"))
            mock_client_cls.return_value = mock_client

            chunks = [chunk async for chunk in stream_answer("system", [{"role": "user", "content": "q"}], max_tokens=100)]
            assert len(chunks) == 1
            assert "not able to answer" in chunks[0].lower()


async def test_stream_answer_refusal_after_partial_text_leaves_it_standing():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.messages.stream = MagicMock(return_value=_FakeMessageStream(["Partial answer"], "refusal"))
            mock_client_cls.return_value = mock_client

            chunks = [chunk async for chunk in stream_answer("system", [{"role": "user", "content": "q"}], max_tokens=100)]
            assert chunks == ["Partial answer"]


async def test_stream_answer_rate_limit_error_maps_to_llm_unavailable():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_client = MagicMock()

            def _raise_stream(*_args, **_kwargs):
                raise anthropic.RateLimitError(
                    "rate limited", response=MagicMock(status_code=429), body=None
                )

            mock_client.messages.stream = MagicMock(side_effect=_raise_stream)
            mock_client_cls.return_value = mock_client

            with pytest.raises(LlmUnavailableError):
                async for _ in stream_answer("system", [{"role": "user", "content": "q"}], max_tokens=100):
                    pass


async def test_stream_answer_blank_api_key_raises_without_calling_the_sdk():
    with patch("app.rag.llm_client.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(ai_provider="anthropic", ai_api_key="")
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            with pytest.raises(LlmRequestError, match="AI_API_KEY is not configured"):
                async for _ in stream_answer("system", [{"role": "user", "content": "q"}], max_tokens=100):
                    pass
            mock_client_cls.assert_not_called()


def _mock_text_block(text: str):
    return MagicMock(type="text", text=text)


def _mock_tool_use_block(id_: str, name: str, tool_input: dict):
    # `name=` can't be passed to the MagicMock() constructor — it's reserved
    # for the mock's own repr, not an attribute — so it's set afterward.
    block = MagicMock(type="tool_use", id=id_, input=tool_input)
    block.name = name
    return block


async def test_create_message_does_not_send_tools_when_none_are_given():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_response = MagicMock(
                stop_reason="end_turn", content=[_mock_text_block("hi")], usage=MagicMock(input_tokens=5, output_tokens=2)
            )
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            await create_message("system", [{"role": "user", "content": "q"}], max_tokens=100)

            assert "tools" not in mock_client.messages.create.call_args.kwargs


async def test_create_message_sends_tools_when_given():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_response = MagicMock(
                stop_reason="end_turn", content=[_mock_text_block("hi")], usage=MagicMock(input_tokens=5, output_tokens=2)
            )
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            tools = [{"name": "get_order", "description": "...", "input_schema": {}}]
            await create_message("system", [{"role": "user", "content": "q"}], max_tokens=100, tools=tools)

            assert mock_client.messages.create.call_args.kwargs["tools"] == tools


async def test_create_message_extracts_tool_use_requests_and_usage():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_response = MagicMock(
                stop_reason="tool_use",
                content=[
                    _mock_text_block("Let me check that."),
                    _mock_tool_use_block("toolu_1", "get_order", {"order_id": "10291"}),
                ],
                usage=MagicMock(input_tokens=120, output_tokens=30),
            )
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await create_message("system", [{"role": "user", "content": "q"}], max_tokens=100)

            assert result.stop_reason == "tool_use"
            assert result.text == "Let me check that."
            assert result.tool_uses == [ToolUseRequest(id="toolu_1", name="get_order", input={"order_id": "10291"})]
            assert result.input_tokens == 120
            assert result.output_tokens == 30


async def test_create_message_raw_content_round_trips_for_continuing_a_tool_use_turn():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_response = MagicMock(
                stop_reason="tool_use",
                content=[
                    _mock_text_block("Checking."),
                    _mock_tool_use_block("toolu_1", "get_order", {"order_id": "10291"}),
                ],
                usage=MagicMock(input_tokens=10, output_tokens=5),
            )
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await create_message("system", [{"role": "user", "content": "q"}], max_tokens=100)

            assert result.raw_content == [
                {"type": "text", "text": "Checking."},
                {"type": "tool_use", "id": "toolu_1", "name": "get_order", "input": {"order_id": "10291"}},
            ]
