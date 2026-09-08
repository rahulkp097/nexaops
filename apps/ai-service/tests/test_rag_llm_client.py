from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import pytest

from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.llm_client import generate_answer


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
                await generate_answer("system", "user content", max_tokens=100)
            mock_client_cls.assert_not_called()


async def test_unsupported_provider_raises_llm_request_error():
    with patch("app.rag.llm_client.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(ai_provider="openai", ai_api_key="sk-test")
        with pytest.raises(LlmRequestError, match="Unsupported AI provider"):
            await generate_answer("system", "user content", max_tokens=100)


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
                await generate_answer("system", "user content", max_tokens=100)


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
                await generate_answer("system", "user content", max_tokens=100)


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
                await generate_answer("system", "user content", max_tokens=100)


async def test_refusal_stop_reason_returns_safe_fallback_answer():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            mock_response = MagicMock(stop_reason="refusal")
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            answer = await generate_answer("system", "user content", max_tokens=100)
            assert "not able to answer" in answer.lower()


async def test_successful_response_extracts_text_blocks():
    with patch("app.rag.llm_client.get_settings", return_value=_mock_settings()):
        with patch("app.rag.llm_client.anthropic.AsyncAnthropic") as mock_client_cls:
            text_block = MagicMock(type="text", text="Refunds are processed within 30 days.")
            mock_response = MagicMock(stop_reason="end_turn", content=[text_block])
            mock_client = MagicMock()
            mock_client.messages.create = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            answer = await generate_answer("system", "user content", max_tokens=100)
            assert answer == "Refunds are processed within 30 days."
