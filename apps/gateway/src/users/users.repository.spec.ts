import { UsersRepository } from './users.repository';
import { Queryable } from '../database/transaction.util';

function makeRepository(rows: unknown[]) {
  const query = jest.fn().mockResolvedValue({ rows });
  const repository = new UsersRepository({ query } as unknown as Queryable);
  return { repository, query };
}

describe('UsersRepository', () => {
  it('normalizes email casing/whitespace on create', async () => {
    const { repository, query } = makeRepository([{ id: 'user-1' }]);

    await repository.create({
      organizationId: 'org-1',
      email: '  User@Example.com ',
      passwordHash: 'hash',
      role: 'ADMIN',
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'org-1',
      'user@example.com',
      'hash',
      'ADMIN',
    ]);
  });

  it('normalizes email casing/whitespace on lookup', async () => {
    const { repository, query } = makeRepository([]);

    await repository.findByEmail('  User@Example.com ');

    expect(query).toHaveBeenCalledWith(expect.any(String), ['user@example.com']);
  });

  it('findActiveByIdAndOrganization binds both id and organizationId — proves cross-tenant lookups by id alone are impossible', async () => {
    const { repository, query } = makeRepository([{ id: 'user-1', organization_id: 'org-1' }]);

    await repository.findActiveByIdAndOrganization('user-1', 'org-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('organization_id = $2');
    expect(params).toEqual(['user-1', 'org-1']);
  });

  it('resolves to null (not the row) when the id exists but belongs to a different organization', async () => {
    // Simulates the DB behavior: WHERE id = $1 AND organization_id = $2
    // returns zero rows when the id exists under a different org.
    const { repository } = makeRepository([]);

    const result = await repository.findActiveByIdAndOrganization('user-1', 'some-other-org');

    expect(result).toBeNull();
  });

  it('findByIdAndOrganization binds both id and organizationId and does not filter by status', async () => {
    const { repository, query } = makeRepository([{ id: 'user-1', organization_id: 'org-1', status: 'DISABLED' }]);

    const result = await repository.findByIdAndOrganization('user-1', 'org-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('organization_id = $2');
    expect(sql).not.toContain("status = 'ACTIVE'");
    expect(params).toEqual(['user-1', 'org-1']);
    expect(result?.status).toBe('DISABLED');
  });

  it('listByOrganization filters by organizationId, ordered by email', async () => {
    const { repository, query } = makeRepository([]);

    await repository.listByOrganization('org-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WHERE organization_id = $1');
    expect(sql).toContain('ORDER BY email ASC');
    expect(params).toEqual(['org-1']);
  });

  it('updateByIdAndOrganization only overwrites the fields provided, scoped to id+organizationId', async () => {
    const { repository, query } = makeRepository([{ id: 'user-1', role: 'MANAGER' }]);

    await repository.updateByIdAndOrganization('user-1', 'org-1', { role: 'MANAGER' });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('organization_id = $2');
    expect(sql).toContain('COALESCE($3, role)');
    expect(sql).toContain('COALESCE($4, status)');
    expect(params).toEqual(['user-1', 'org-1', 'MANAGER', null]);
  });

  it('countActiveAdminsExcluding excludes the given user id and only counts active admins', async () => {
    const { repository, query } = makeRepository([{ count: 2 }]);

    const result = await repository.countActiveAdminsExcluding('org-1', 'user-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("role = 'ADMIN'");
    expect(sql).toContain("status = 'ACTIVE'");
    expect(sql).toContain('id <> $2');
    expect(params).toEqual(['org-1', 'user-1']);
    expect(result).toBe(2);
  });

  it('countActiveAdminsExcluding returns 0 when no rows come back', async () => {
    const { repository } = makeRepository([]);

    const result = await repository.countActiveAdminsExcluding('org-1', 'user-1');

    expect(result).toBe(0);
  });
});
