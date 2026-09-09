import { RequestContextService } from './request-context.service';

// Forwards the current request's id (see RequestLoggingMiddleware) to
// ai-service so its own logs correlate with the gateway's — spec §27's
// trace tree spans both services, not just one. Omitted entirely (rather
// than sent as undefined/empty) outside a real request context, e.g. a
// unit test that never ran inside RequestContextService.run().
export function withRequestId(
  headers: Record<string, string>,
  requestContext: RequestContextService,
): Record<string, string> {
  const requestId = requestContext.requestId;
  return requestId ? { ...headers, 'X-Request-Id': requestId } : headers;
}
