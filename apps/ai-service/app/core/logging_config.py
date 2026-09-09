import logging

from app.core.request_context import get_request_id


class RequestIdFilter(logging.Filter):
    """Injects the current request's id into every LogRecord, so a plain
    `logger.info(...)` call anywhere in the codebase automatically carries
    it without every call site having to pass it explicitly."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


_LOG_FORMAT = "%(asctime)s %(levelname)s [request_id=%(request_id)s] %(name)s: %(message)s"


def configure_logging(level: int = logging.INFO) -> None:
    """Replaces the root logger's handlers with one that stamps every line
    with the current request id. Deliberately does not touch uvicorn's own
    `uvicorn.access`/`uvicorn.error` loggers — those are configured
    separately by uvicorn itself and aren't part of this application's own
    request tracing."""
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(logging.Formatter(_LOG_FORMAT))

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
