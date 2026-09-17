import { ConfigService } from '@nestjs/config';
import { RequestContextService } from '../../observability/request-context.service';
import { AiServiceAgentClient } from './ai-service-agent.client';

function makeSseResponse(body: string, init: { ok?: boolean; status?: number } = {}) {
  const encoder = new TextEncoder();
  let sent = false;
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) {
            return { done: true, value: undefined };
          }
          sent = true;
          return { done: false, value: encoder.encode(body) };
        },
        releaseLock: () => undefined,
      }),
    },
  };
}

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe('AiServiceAgentClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeClient(aiServiceUrl?: string, requestContext = new RequestContextService()) {
    const config = { get: jest.fn().mockReturnValue(aiServiceUrl) } as unknown as ConfigService;
    return new AiServiceAgentClient(config, requestContext);
  }

  it('POSTs question/organizationId/userId/role/history to AI_SERVICE_URL and yields parsed events', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        makeSseResponse(
          'event: tool_call_started\ndata: {"name":"get_order","arguments":{"orderId":"10291"}}\n\n' +
            'event: done\ndata: {"answer":"Delayed."}\n\n',
        ),
      );
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient('http://ai-service:9000');

    const events = await collect(
      client.streamRun({ question: 'q', organizationId: 'org-1', userId: 'user-1', role: 'MANAGER', history: [] }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ai-service:9000/agent/run/stream',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'q', organizationId: 'org-1', userId: 'user-1', role: 'MANAGER', history: [] }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(events).toEqual([
      { event: 'tool_call_started', data: { name: 'get_order', arguments: { orderId: '10291' } } },
      { event: 'done', data: { answer: 'Delayed.' } },
    ]);
  });

  it('includes conversationSummary in the request body when given', async () => {
    const fetchMock = jest.fn().mockResolvedValue(makeSseResponse('event: done\ndata: {}\n\n'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient('http://ai-service:9000');

    await collect(
      client.streamRun({
        question: 'q',
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'ADMIN',
        history: [],
        conversationSummary: 'The user previously asked about refunds.',
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ai-service:9000/agent/run/stream',
      expect.objectContaining({
        body: JSON.stringify({
          question: 'q',
          organizationId: 'org-1',
          userId: 'user-1',
          role: 'ADMIN',
          history: [],
          conversationSummary: 'The user previously asked about refunds.',
        }),
      }),
    );
  });

  it('defaults to http://localhost:8000 when AI_SERVICE_URL is not configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue(makeSseResponse('event: done\ndata: {}\n\n'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient(undefined);

    await collect(client.streamRun({ question: 'q', organizationId: 'org-1', userId: 'user-1', role: 'EMPLOYEE', history: [] }));

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/agent/run/stream', expect.anything());
  });

  it('throws when the response is not ok', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeSseResponse('', { ok: false, status: 422 })) as unknown as typeof fetch;
    const client = makeClient();

    await expect(
      collect(client.streamRun({ question: 'q', organizationId: 'org-1', userId: 'user-1', role: 'ADMIN', history: [] })),
    ).rejects.toThrow('422');
  });

  it('throws when the response has no body', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, body: null }) as unknown as typeof fetch;
    const client = makeClient();

    await expect(
      collect(client.streamRun({ question: 'q', organizationId: 'org-1', userId: 'user-1', role: 'ADMIN', history: [] })),
    ).rejects.toThrow('empty response body');
  });

  it('forwards the current request id as X-Request-Id when one is set', async () => {
    const fetchMock = jest.fn().mockResolvedValue(makeSseResponse('event: done\ndata: {}\n\n'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const requestContext = new RequestContextService();
    const client = makeClient('http://ai-service:9000', requestContext);

    await requestContext.run({ requestId: 'req-1' }, () =>
      collect(client.streamRun({ question: 'q', organizationId: 'org-1', userId: 'user-1', role: 'ADMIN', history: [] })),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-1' },
      }),
    );
  });
});
