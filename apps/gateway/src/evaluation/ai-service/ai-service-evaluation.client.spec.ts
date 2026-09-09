import { ConfigService } from '@nestjs/config';
import { RequestContextService } from '../../observability/request-context.service';
import { EvaluationCaseRow } from '../evaluation.types';
import { AiServiceEvaluationClient } from './ai-service-evaluation.client';

function makeCaseRow(overrides: Partial<EvaluationCaseRow> = {}): EvaluationCaseRow {
  return {
    id: 'case-1',
    organization_id: 'org-1',
    category: 'BUSINESS_API',
    question: 'What is the status of order 10291?',
    expected_answer_contains: 'DELAYED',
    expected_sources: [],
    expected_tool_names: [],
    metadata: { toolName: 'get_order', arguments: { order_id: '10291' } },
    created_at: new Date(),
    ...overrides,
  };
}

describe('AiServiceEvaluationClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeClient(aiServiceUrl?: string, requestContext = new RequestContextService()) {
    const config = { get: jest.fn().mockReturnValue(aiServiceUrl) } as unknown as ConfigService;
    return new AiServiceEvaluationClient(config, requestContext);
  }

  it('POSTs organization/user/role and cases mapped to camelCase field names', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [], metrics: { totalCases: 1 }, model: 'claude-sonnet-5', provider: 'anthropic' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient('http://ai-service:9000');

    const payload = await client.run({
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'ADMIN',
      cases: [makeCaseRow()],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ai-service:9000/evaluation/run',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: 'org-1',
          userId: 'user-1',
          role: 'ADMIN',
          cases: [
            {
              id: 'case-1',
              category: 'BUSINESS_API',
              question: 'What is the status of order 10291?',
              expectedAnswerContains: 'DELAYED',
              expectedSources: [],
              expectedToolNames: [],
              metadata: { toolName: 'get_order', arguments: { order_id: '10291' } },
            },
          ],
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(payload.metrics).toEqual({ totalCases: 1 });
  });

  it('defaults to http://localhost:8000 when AI_SERVICE_URL is not configured', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [], metrics: {}, model: '', provider: '' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient(undefined);

    await client.run({ organizationId: 'org-1', userId: 'user-1', role: 'ADMIN', cases: [makeCaseRow()] });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/evaluation/run', expect.anything());
  });

  it('throws when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as unknown as typeof fetch;
    const client = makeClient();

    await expect(
      client.run({ organizationId: 'org-1', userId: 'user-1', role: 'ADMIN', cases: [makeCaseRow()] }),
    ).rejects.toThrow('502');
  });

  it('forwards the current request id as X-Request-Id when one is set', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [], metrics: {}, model: '', provider: '' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const requestContext = new RequestContextService();
    const client = makeClient('http://ai-service:9000', requestContext);

    await requestContext.run({ requestId: 'req-1' }, () =>
      client.run({ organizationId: 'org-1', userId: 'user-1', role: 'ADMIN', cases: [makeCaseRow()] }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-1' },
      }),
    );
  });
});
