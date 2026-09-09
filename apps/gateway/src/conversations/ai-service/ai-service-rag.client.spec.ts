import { ConfigService } from '@nestjs/config';
import { RequestContextService } from '../../observability/request-context.service';
import { AiServiceRagClient } from './ai-service-rag.client';

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

describe('AiServiceRagClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeClient(aiServiceUrl?: string, requestContext = new RequestContextService()) {
    const config = { get: jest.fn().mockReturnValue(aiServiceUrl) } as unknown as ConfigService;
    return new AiServiceRagClient(config, requestContext);
  }

  it('POSTs question/organizationId/history to AI_SERVICE_URL and yields parsed events', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        makeSseResponse('event: token\ndata: {"text":"Hi"}\n\nevent: done\ndata: {"answer":"Hi"}\n\n'),
      );
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient('http://ai-service:9000');

    const events = await collect(
      client.streamQuery({ question: 'q', organizationId: 'org-1', history: [] }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ai-service:9000/rag/query/stream',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'q', organizationId: 'org-1', history: [] }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(events).toEqual([
      { event: 'token', data: { text: 'Hi' } },
      { event: 'done', data: { answer: 'Hi' } },
    ]);
  });

  it('includes conversationSummary in the request body when given', async () => {
    const fetchMock = jest.fn().mockResolvedValue(makeSseResponse('event: done\ndata: {}\n\n'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient('http://ai-service:9000');

    await collect(
      client.streamQuery({
        question: 'q',
        organizationId: 'org-1',
        history: [],
        conversationSummary: 'The user previously asked about refunds.',
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ai-service:9000/rag/query/stream',
      expect.objectContaining({
        body: JSON.stringify({
          question: 'q',
          organizationId: 'org-1',
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

    await collect(client.streamQuery({ question: 'q', organizationId: 'org-1', history: [] }));

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/rag/query/stream', expect.anything());
  });

  it('throws when the response is not ok', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeSseResponse('', { ok: false, status: 422 })) as unknown as typeof fetch;
    const client = makeClient();

    await expect(
      collect(client.streamQuery({ question: 'q', organizationId: 'org-1', history: [] })),
    ).rejects.toThrow('422');
  });

  it('throws when the response has no body', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, body: null }) as unknown as typeof fetch;
    const client = makeClient();

    await expect(
      collect(client.streamQuery({ question: 'q', organizationId: 'org-1', history: [] })),
    ).rejects.toThrow('empty response body');
  });

  it('forwards the current request id as X-Request-Id when one is set', async () => {
    const fetchMock = jest.fn().mockResolvedValue(makeSseResponse('event: done\ndata: {}\n\n'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const requestContext = new RequestContextService();
    const client = makeClient('http://ai-service:9000', requestContext);

    await requestContext.run({ requestId: 'req-1' }, () =>
      collect(client.streamQuery({ question: 'q', organizationId: 'org-1', history: [] })),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-1' },
      }),
    );
  });
});
