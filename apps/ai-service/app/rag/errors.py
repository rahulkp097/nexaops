class RagServiceError(Exception):
    """Base class for errors raised while answering a RAG query."""


class LlmUnavailableError(RagServiceError):
    """AI provider unreachable/rate-limited/5xx — retryable by the caller."""


class LlmRequestError(RagServiceError):
    """AI provider rejected the request (auth, bad model, 4xx) — not retryable."""
