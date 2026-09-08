import logging
from collections.abc import AsyncIterator

import anthropic

from app.core.config import get_settings
from app.rag.errors import LlmRequestError, LlmUnavailableError, RagServiceError

# Spec §42: "Keep AI provider code behind an abstraction." This is the only
# module allowed to import the anthropic SDK directly.

logger = logging.getLogger(__name__)

_REFUSAL_ANSWER = "I'm not able to answer that question based on the available evidence."

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=get_settings().ai_api_key)
    return _client


def _check_configured() -> None:
    settings = get_settings()
    if settings.ai_provider != "anthropic":
        raise LlmRequestError(f"Unsupported AI provider: {settings.ai_provider!r}")
    if not settings.ai_api_key:
        # An empty api_key reaches the SDK and raises a raw, undocumented
        # TypeError from its internal header-validation path rather than
        # one of its typed exceptions — catch the misconfiguration here
        # instead, with a clear diagnostic.
        raise LlmRequestError("AI_API_KEY is not configured")


def _map_error(exc: anthropic.APIError, model: str) -> RagServiceError:
    # Order matters: AuthenticationError/NotFoundError/RateLimitError are
    # all subclasses of APIStatusError, so they're checked first.
    if isinstance(exc, anthropic.AuthenticationError):
        logger.warning("AI provider rejected the API key: %s", exc)
        return LlmRequestError("AI provider rejected the API key")
    if isinstance(exc, anthropic.NotFoundError):
        logger.warning("AI provider model not found (%s): %s", model, exc)
        return LlmRequestError(f"AI provider model not found: {model}")
    if isinstance(exc, anthropic.RateLimitError):
        logger.warning("AI provider rate limit exceeded: %s", exc)
        return LlmUnavailableError("AI provider rate limit exceeded")
    if isinstance(exc, anthropic.APIStatusError):
        # exc's string form includes the provider's own error message (e.g.
        # "credit balance too low", "invalid model") — the only place that
        # detail is available, so always log it rather than just the code.
        logger.warning("AI provider request rejected (%s): %s", exc.status_code, exc)
        if exc.status_code >= 500:
            return LlmUnavailableError(f"AI provider server error ({exc.status_code})")
        return LlmRequestError(f"AI provider request rejected ({exc.status_code})")
    logger.warning("Could not reach AI provider: %s", exc)
    return LlmUnavailableError("Could not reach AI provider")


async def generate_answer(system: str, messages: list[dict[str, str]], max_tokens: int) -> str:
    _check_configured()
    settings = get_settings()

    try:
        response = await _get_client().messages.create(
            model=settings.ai_model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
            # Bounded factual Q&A over a handful of short chunks doesn't
            # benefit from the model's higher default reasoning effort.
            output_config={"effort": "low"},
        )
    except anthropic.APIError as exc:
        raise _map_error(exc, settings.ai_model) from exc

    if response.stop_reason == "refusal":
        return _REFUSAL_ANSWER

    return "".join(block.text for block in response.content if block.type == "text").strip()


async def stream_answer(
    system: str, messages: list[dict[str, str]], max_tokens: int
) -> AsyncIterator[str]:
    """Yields text deltas as they arrive. A "refusal" stop reason is only
    turned into `_REFUSAL_ANSWER` when nothing was streamed yet — once
    partial text has already reached the caller there is no way to retract
    it, so it is left standing rather than appending a contradictory
    fallback."""
    _check_configured()
    settings = get_settings()

    yielded_any = False
    try:
        async with _get_client().messages.stream(
            model=settings.ai_model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
            output_config={"effort": "low"},
        ) as stream:
            async for text in stream.text_stream:
                yielded_any = True
                yield text
            final_message = await stream.get_final_message()
    except anthropic.APIError as exc:
        raise _map_error(exc, settings.ai_model) from exc

    if final_message.stop_reason == "refusal" and not yielded_any:
        yield _REFUSAL_ANSWER
