import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.request_context import reset_request_id, set_request_id

logger = logging.getLogger("app.request")

REQUEST_ID_HEADER = "X-Request-Id"


class RequestContextMiddleware(BaseHTTPMiddleware):
    """spec §27's trace tree, the ai-service half: reuses the gateway's
    request id when given (see apps/gateway's RequestLoggingMiddleware),
    or generates one — useful when this service is called directly, e.g.
    in local testing. Logs one line per request with total latency; every
    other log line during the request (retrieval, tool calls, the LLM
    call) picks up the same id via app.core.logging_config's filter,
    without this middleware having to know about any of them."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        token = set_request_id(request_id)
        start = time.monotonic()
        try:
            response = await call_next(request)
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            response.headers[REQUEST_ID_HEADER] = request_id
            logger.info("%s %s %s %sms", request.method, request.url.path, response.status_code, duration_ms)
            return response
        finally:
            reset_request_id(token)
