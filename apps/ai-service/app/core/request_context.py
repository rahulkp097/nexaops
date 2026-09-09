import contextvars

# Phase 18 (spec §27): every log line along one request's path — retrieval,
# tool calls, the LLM call, the response — should carry the same request
# id. A ContextVar (rather than threading an argument through every
# function signature) is set once by RequestContextMiddleware and read
# anywhere downstream via a logging.Filter (see app.core.logging_config),
# including inside async tasks spawned from the same request.
_NO_REQUEST_ID = "-"

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default=_NO_REQUEST_ID)


def get_request_id() -> str:
    return _request_id.get()


def set_request_id(value: str) -> contextvars.Token:
    return _request_id.set(value)


def reset_request_id(token: contextvars.Token) -> None:
    _request_id.reset(token)
