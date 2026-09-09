import { ConfigService } from '@nestjs/config';
import { RequestContextService } from '../../observability/request-context.service';
import { AiServiceMemoryClient } from './ai-service-memory.client';

describe('AiServiceMemoryClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeClient(aiServiceUrl?: string, requestContext = new RequestContextService()) {
    const config = { get: jest.fn().mockReturnValue(aiServiceUrl) } as unknown as ConfigService;
    return new AiServiceMemoryClient(config, requestContext);
  }

  it('POSTs previousSummary/messages to AI_SERVICE_URL and returns the summary', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ summary: 'The user asked about order 10291.' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient('http://ai-service:9000');

    const summary = await client.summarize({
      previousSummary: null,
      messages: [{ role: 'user', content: 'What is order 10291’s status?' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ai-service:9000/memory/summarize',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previousSummary: null,
          messages: [{ role: 'user', content: 'What is order 10291’s status?' }],
        }),
      }),
    );
    expect(summary).toBe('The user asked about order 10291.');
  });

  it('defaults to http://localhost:8000 when AI_SERVICE_URL is not configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ summary: 'ok' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient(undefined);

    await client.summarize({ previousSummary: null, messages: [] });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/memory/summarize', expect.anything());
  });

  it('throws when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    const client = makeClient();

    await expect(client.summarize({ previousSummary: null, messages: [] })).rejects.toThrow('503');
  });

  it('forwards the current request id as X-Request-Id when one is set', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ summary: 'ok' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const requestContext = new RequestContextService();
    const client = makeClient('http://ai-service:9000', requestContext);

    await requestContext.run({ requestId: 'req-1' }, () =>
      client.summarize({ previousSummary: null, messages: [] }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-1' },
      }),
    );
  });
});
