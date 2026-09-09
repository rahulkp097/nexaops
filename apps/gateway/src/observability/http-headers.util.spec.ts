import { withRequestId } from './http-headers.util';
import { RequestContextService } from './request-context.service';

describe('withRequestId', () => {
  it('returns the headers unchanged when no request id is set', () => {
    const requestContext = new RequestContextService();

    const result = withRequestId({ 'Content-Type': 'application/json' }, requestContext);

    expect(result).toEqual({ 'Content-Type': 'application/json' });
  });

  it('adds X-Request-Id when a request id is set', async () => {
    const requestContext = new RequestContextService();

    const result = await requestContext.run({ requestId: 'req-1' }, () =>
      withRequestId({ 'Content-Type': 'application/json' }, requestContext),
    );

    expect(result).toEqual({ 'Content-Type': 'application/json', 'X-Request-Id': 'req-1' });
  });

  it('does not mutate the headers object passed in', async () => {
    const requestContext = new RequestContextService();
    const original = { 'Content-Type': 'application/json' };

    await requestContext.run({ requestId: 'req-1' }, () => withRequestId(original, requestContext));

    expect(original).toEqual({ 'Content-Type': 'application/json' });
  });
});
