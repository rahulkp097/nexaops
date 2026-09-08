import logging

import anthropic

from app.core.config import get_settings
from app.rag.errors import LlmRequestError, LlmUnavailableError

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


async def generate_answer(system: str, user_content: str, max_tokens: int) -> str:
    settings = get_settings()
    if settings.ai_provider != "anthropic":
        raise LlmRequestError(f"Unsupported AI provider: {settings.ai_provider!r}")
    if not settings.ai_api_key:
        # An empty api_key reaches the SDK and raises a raw, undocumented
        # TypeError from its internal header-validation path rather than
        # one of its typed exceptions — catch the misconfiguration here
        # instead, with a clear diagnostic.
        raise LlmRequestError("AI_API_KEY is not configured")

    try:
        response = await _get_client().messages.create(
            model=settings.ai_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
            # Bounded factual Q&A over a handful of short chunks doesn't
            # benefit from the model's higher default reasoning effort.
            output_config={"effort": "low"},
        )
    except anthropic.AuthenticationError as exc:
        logger.warning("AI provider rejected the API key: %s", exc)
        raise LlmRequestError("AI provider rejected the API key") from exc
    except anthropic.NotFoundError as exc:
        logger.warning("AI provider model not found (%s): %s", settings.ai_model, exc)
        raise LlmRequestError(f"AI provider model not found: {settings.ai_model}") from exc
    except anthropic.RateLimitError as exc:
        logger.warning("AI provider rate limit exceeded: %s", exc)
        raise LlmUnavailableError("AI provider rate limit exceeded") from exc
    except anthropic.APIStatusError as exc:
        # exc's string form includes the provider's own error message (e.g.
        # "credit balance too low", "invalid model") — the only place that
        # detail is available, so always log it rather than just the code.
        logger.warning("AI provider request rejected (%s): %s", exc.status_code, exc)
        if exc.status_code >= 500:
            raise LlmUnavailableError(f"AI provider server error ({exc.status_code})") from exc
        raise LlmRequestError(f"AI provider request rejected ({exc.status_code})") from exc
    except anthropic.APIConnectionError as exc:
        logger.warning("Could not reach AI provider: %s", exc)
        raise LlmUnavailableError("Could not reach AI provider") from exc

    if response.stop_reason == "refusal":
        return _REFUSAL_ANSWER

    return "".join(block.text for block in response.content if block.type == "text").strip()
