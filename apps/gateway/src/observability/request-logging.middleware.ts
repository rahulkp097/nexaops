import { randomUUID } from 'crypto';
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types/request-user.type';
import { RequestContextService } from './request-context.service';

const REQUEST_ID_HEADER = 'x-request-id';

// spec §27's trace tree, the gateway's slice of it: one log line per
// request carrying request id, organization/user scope (never anything
// from the body or the Authorization header — nothing here can leak a
// password, a chat message, or a token), status, and total latency.
// Registered as global middleware (see AppModule.configure), so it wraps
// every route including ones outside any feature module.
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly requestContext: RequestContextService) {}

  use(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    res.setHeader('X-Request-Id', requestId);

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const scope = req.user ? ` organizationId=${req.user.organizationId} userId=${req.user.userId}` : '';
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms requestId=${requestId}${scope}`,
      );
    });

    this.requestContext.run({ requestId }, () => next());
  }
}
