import { AuditLogsRepository } from './audit-logs.repository';
import { Queryable } from '../database/transaction.util';

describe('AuditLogsRepository', () => {
  it('inserts an audit row with metadata serialized as JSON', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new AuditLogsRepository({ query } as unknown as Queryable);

    await repository.insert({
      organizationId: 'org-1',
      userId: 'user-1',
      action: 'user.login_succeeded',
      resource: 'user',
      metadata: { ip: '127.0.0.1' },
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'org-1',
      'user-1',
      'user.login_succeeded',
      'user',
      JSON.stringify({ ip: '127.0.0.1' }),
    ]);
  });

  it('defaults organizationId/userId to null and metadata to {} when omitted', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new AuditLogsRepository({ query } as unknown as Queryable);

    await repository.insert({ action: 'user.login_failed', resource: 'user' });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      null,
      null,
      'user.login_failed',
      'user',
      '{}',
    ]);
  });
});
