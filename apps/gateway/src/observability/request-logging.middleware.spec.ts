import { Logger } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { RequestLoggingMiddleware } from './request-logging.middleware';

function makeResponse() {
  const listeners: Record<string, () => void> = {};
  return {
    statusCode: 200,
    setHeader: jest.fn(),
    on: jest.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    }),
    finish: () => listeners.finish?.(),
  };
}

describe('RequestLoggingMiddleware', () => {
  let requestContext: RequestContextService;
  let middleware: RequestLoggingMiddleware;

  beforeEach(() => {
    requestContext = new RequestContextService();
    middleware = new RequestLoggingMiddleware(requestContext);
  });

  it('generates a request id when none is given and sets it on the response', () => {
    const req = { headers: {}, method: 'GET', originalUrl: '/health' } as any;
    const res = makeResponse();
    const next = jest.fn();

    middleware.use(req, res as any, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(next).toHaveBeenCalled();
  });

  it('reuses an incoming x-request-id header instead of generating a new one', () => {
    const req = { headers: { 'x-request-id': 'incoming-id' }, method: 'GET', originalUrl: '/health' } as any;
    const res = makeResponse();

    middleware.use(req, res as any, jest.fn());

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'incoming-id');
  });

  it('makes the request id available via RequestContextService for the rest of the request', () => {
    const req = { headers: { 'x-request-id': 'req-1' }, method: 'GET', originalUrl: '/health' } as any;
    const res = makeResponse();
    let seenInsideHandler: string | undefined;

    middleware.use(req, res as any, () => {
      seenInsideHandler = requestContext.requestId;
    });

    expect(seenInsideHandler).toBe('req-1');
  });

  it('logs method/path/status/duration/requestId, and organization+user scope once authenticated', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const req = {
      headers: { 'x-request-id': 'req-1' },
      method: 'POST',
      originalUrl: '/conversations/conv-1/messages',
      user: { userId: 'user-1', organizationId: 'org-1', role: 'EMPLOYEE' },
    } as any;
    const res = makeResponse();
    res.statusCode = 201;

    middleware.use(req, res as any, jest.fn());
    res.finish();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^POST \/conversations\/conv-1\/messages 201 \d+(\.\d+)?ms requestId=req-1 organizationId=org-1 userId=user-1$/,
      ),
    );
    logSpy.mockRestore();
  });

  it('logs without an organization/user scope when the request never authenticated', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const req = { headers: { 'x-request-id': 'req-1' }, method: 'GET', originalUrl: '/health' } as any;
    const res = makeResponse();

    middleware.use(req, res as any, jest.fn());
    res.finish();

    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^GET \/health 200 \d+(\.\d+)?ms requestId=req-1$/));
    logSpy.mockRestore();
  });
});
