import { OrganizationsRepository } from './organizations.repository';
import { Queryable } from '../database/transaction.util';

describe('OrganizationsRepository', () => {
  it('inserts a new organization and returns the created row', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ id: 'org-1', name: 'Acme', created_at: new Date() }],
    });
    const repository = new OrganizationsRepository({ query } as unknown as Queryable);

    const result = await repository.create('Acme');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO organizations'), [
      'Acme',
    ]);
    expect(result.id).toBe('org-1');
  });

  it('runs on the given queryable (e.g. a transaction client) when provided', async () => {
    const poolQuery = jest.fn();
    const clientQuery = jest.fn().mockResolvedValue({ rows: [{ id: 'org-2' }] });
    const repository = new OrganizationsRepository({ query: poolQuery } as unknown as Queryable);

    await repository.create('Beta', { query: clientQuery } as unknown as Queryable);

    expect(clientQuery).toHaveBeenCalled();
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
