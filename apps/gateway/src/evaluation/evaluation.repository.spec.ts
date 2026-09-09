import { EvaluationRepository } from './evaluation.repository';
import { Queryable } from '../database/transaction.util';

function makeRepository(rows: unknown[]) {
  const query = jest.fn().mockResolvedValue({ rows });
  const repository = new EvaluationRepository({ query } as unknown as Queryable);
  return { repository, query };
}

describe('EvaluationRepository', () => {
  it('listCasesByOrganization filters by organization and orders oldest first', async () => {
    const { repository, query } = makeRepository([]);

    await repository.listCasesByOrganization('org-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('organization_id = $1');
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(params).toEqual(['org-1']);
  });

  it('createRun binds an explicit id and starts the run as RUNNING', async () => {
    const { repository, query } = makeRepository([{ id: 'run-1', status: 'RUNNING' }]);

    await repository.createRun({ id: 'run-1', organizationId: 'org-1', triggeredByUserId: 'user-1' });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("'RUNNING'");
    expect(params).toEqual(['run-1', 'org-1', 'user-1']);
  });

  it('completeRun serializes metrics as jsonb and stamps completed_at', async () => {
    const { repository, query } = makeRepository([{ id: 'run-1', status: 'COMPLETED' }]);

    await repository.completeRun('run-1', {
      status: 'COMPLETED',
      model: 'claude-sonnet-5',
      provider: 'anthropic',
      metrics: { passRate: 1 },
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('completed_at = now()');
    expect(params).toEqual(['run-1', 'COMPLETED', 'claude-sonnet-5', 'anthropic', JSON.stringify({ passRate: 1 }), null]);
  });

  it('completeRun with a FAILED status carries the error and no metrics', async () => {
    const { repository, query } = makeRepository([{ id: 'run-1', status: 'FAILED' }]);

    await repository.completeRun('run-1', { status: 'FAILED', error: 'AI service unreachable' });

    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['run-1', 'FAILED', null, null, null, 'AI service unreachable']);
  });

  it('findRunByIdAndOrganization binds both id and organizationId', async () => {
    const { repository, query } = makeRepository([]);

    await repository.findRunByIdAndOrganization('run-1', 'org-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('organization_id = $2');
    expect(params).toEqual(['run-1', 'org-1']);
  });

  it('resolves to null when the run id exists but belongs to a different organization', async () => {
    const { repository } = makeRepository([]);

    const result = await repository.findRunByIdAndOrganization('run-1', 'some-other-org');

    expect(result).toBeNull();
  });

  it('createCaseResults inserts one row per result and returns them all', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'result-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'result-2' }] });
    const repository = new EvaluationRepository({ query } as unknown as Queryable);

    const result = await repository.createCaseResults([
      {
        id: 'result-1',
        runId: 'run-1',
        caseId: 'case-1',
        category: 'DOCUMENT_QA',
        question: 'What is the refund policy?',
        passed: true,
        latencyMs: 120,
        answer: 'Refunds take 30 days.',
        scores: { recallAtK: 1 },
        error: null,
      },
      {
        id: 'result-2',
        runId: 'run-1',
        caseId: 'case-2',
        category: 'BUSINESS_API',
        question: 'What is the status of order 10291?',
        passed: false,
        latencyMs: 40,
        answer: null,
        scores: {},
        error: 'Tool call failed',
      },
    ]);

    expect(query).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ id: 'result-1' }, { id: 'result-2' }]);
  });

  it('listCaseResultsByRun filters by run and orders oldest first', async () => {
    const { repository, query } = makeRepository([]);

    await repository.listCaseResultsByRun('run-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('run_id = $1');
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(params).toEqual(['run-1']);
  });
});
