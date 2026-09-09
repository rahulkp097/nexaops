import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import anthropic

from app.core.config import get_settings
from app.rag.errors import LlmRequestError, LlmUnavailableError, RagServiceError

# Spec §42: "Keep AI provider code behind an abstraction." This is the only
# module allowed to import the anthropic SDK directly.

logger = logging.getLogger(__name__)

_REFUSAL_ANSWER = "I'm not able to answer that question based on the available evidence."

_client: anthropic.AsyncAnthropic | None = None


@dataclass(frozen=True)
class ToolUseRequest:
    id: str
    name: str
    input: dict[str, Any]


@dataclass(frozen=True)
class MessageResult:
    """Everything app.agents.orchestrator needs from one Claude turn — a
    richer result than generate_answer's plain string, since the agent
    loop (unlike a one-shot RAG answer) has to inspect stop_reason and any
    requested tool calls, and re-submit the exact same content blocks
    Claude sent as the next turn's assistant message."""

    stop_reason: str
    text: str
    tool_uses: list[ToolUseRequest]
    # Anthropic's own content-block shape, verbatim — this is what must be
    # appended back as the assistant's turn when continuing a tool-use
    # conversation; re-deriving it from `text`/`tool_uses` alone would lose
    # information (block ordering, citations, etc.).
    raw_content: list[dict[str, Any]] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0


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


def _block_to_dict(block: Any) -> dict[str, Any]:
    if block.type == "text":
        return {"type": "text", "text": block.text}
    if block.type == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    # Anything else (e.g. a future block type) is passed through via the
    # SDK's own serialization rather than dropped — Claude still needs it
    # echoed back verbatim if this turn is continued.
    return block.model_dump(mode="json")


async def create_message(
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    tools: list[dict[str, Any]] | None = None,
) -> MessageResult:
    """Lower-level than generate_answer: used by app.agents.orchestrator,
    which needs stop_reason and any requested tool calls, not just the
    final text. generate_answer is a thin wrapper over this."""
    _check_configured()
    settings = get_settings()

    # Send `tools` only when non-empty rather than `[]` — the SDK's own
    # default is to omit the field entirely, and an actually-empty list is
    # untested territory on the API side.
    create_kwargs: dict[str, Any] = dict(
        model=settings.ai_model,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
        # Bounded factual Q&A over a handful of short chunks doesn't
        # benefit from the model's higher default reasoning effort.
        output_config={"effort": "low"},
    )
    if tools:
        create_kwargs["tools"] = tools

    start = time.monotonic()
    try:
        response = await _get_client().messages.create(**create_kwargs)
    except anthropic.APIError as exc:
        raise _map_error(exc, settings.ai_model) from exc
    duration_ms = round((time.monotonic() - start) * 1000, 1)

    # spec §27: "LLM provider/model. Token usage when available." — the one
    # choke point every LLM call in the app (RAG, agent, SQL generation,
    # conversation-memory summarization) goes through, so instrumenting it
    # here covers all of them at once.
    logger.info(
        "LLM request completed: model=%s provider=%s stop_reason=%s input_tokens=%s output_tokens=%s duration_ms=%s",
        settings.ai_model,
        settings.ai_provider,
        response.stop_reason,
        response.usage.input_tokens,
        response.usage.output_tokens,
        duration_ms,
    )

    text = "".join(block.text for block in response.content if block.type == "text").strip()
    tool_uses = [
        ToolUseRequest(id=block.id, name=block.name, input=block.input)
        for block in response.content
        if block.type == "tool_use"
    ]

    return MessageResult(
        stop_reason=response.stop_reason,
        text=text,
        tool_uses=tool_uses,
        raw_content=[_block_to_dict(block) for block in response.content],
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )


async def generate_answer(system: str, messages: list[dict[str, str]], max_tokens: int) -> str:
    result = await create_message(system=system, messages=messages, max_tokens=max_tokens)
    if result.stop_reason == "refusal":
        return _REFUSAL_ANSWER
    return result.text


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

    start = time.monotonic()
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
    duration_ms = round((time.monotonic() - start) * 1000, 1)

    usage = getattr(final_message, "usage", None)
    logger.info(
        "LLM stream completed: model=%s provider=%s stop_reason=%s input_tokens=%s output_tokens=%s duration_ms=%s",
        settings.ai_model,
        settings.ai_provider,
        final_message.stop_reason,
        getattr(usage, "input_tokens", None),
        getattr(usage, "output_tokens", None),
        duration_ms,
    )

    if final_message.stop_reason == "refusal" and not yielded_any:
        yield _REFUSAL_ANSWER
