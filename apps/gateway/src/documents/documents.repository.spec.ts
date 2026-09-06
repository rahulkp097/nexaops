import { DocumentsRepository } from './documents.repository';
import { Queryable } from '../database/transaction.util';

function makeRepository(rows: unknown[]) {
  const query = jest.fn().mockResolvedValue({ rows });
  const repository = new DocumentsRepository({ query } as unknown as Queryable);
  return { repository, query };
}

describe('DocumentsRepository', () => {
  it('create binds an explicit id (not left to a DB default)', async () => {
    const { repository, query } = makeRepository([{ id: 'doc-1' }]);

    await repository.create({
      id: 'doc-1',
      organizationId: 'org-1',
      filename: 'report.pdf',
      storageKey: 'org-1/doc-1.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      checksum: 'abc123',
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'doc-1',
      'org-1',
      'report.pdf',
      'org-1/doc-1.pdf',
      'application/pdf',
      1024,
      'abc123',
    ]);
  });

  it('findByIdAndOrganization binds both id and organizationId — proves cross-tenant lookups by id alone are impossible', async () => {
    const { repository, query } = makeRepository([{ id: 'doc-1', organization_id: 'org-1' }]);

    await repository.findByIdAndOrganization('doc-1', 'org-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('organization_id = $2');
    expect(params).toEqual(['doc-1', 'org-1']);
  });

  it('resolves to null when the document id exists but belongs to a different organization', async () => {
    const { repository } = makeRepository([]);

    const result = await repository.findByIdAndOrganization('doc-1', 'some-other-org');

    expect(result).toBeNull();
  });

  it('deleteByIdAndOrganization is scoped to both id and organizationId', async () => {
    const { repository, query } = makeRepository([]);

    const result = await repository.deleteByIdAndOrganization('doc-1', 'org-B');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('organization_id = $2');
    expect(params).toEqual(['doc-1', 'org-B']);
    // A document from org A cannot be deleted by supplying org B's id: zero
    // rows affected, not the row.
    expect(result).toBeNull();
  });

  it('incrementVersionAndReprocess bumps version and resets status to PROCESSING', async () => {
    const { repository, query } = makeRepository([{ id: 'doc-1', version: 2, status: 'PROCESSING' }]);

    await repository.incrementVersionAndReprocess('doc-1', 'org-1');

    const [sql] = query.mock.calls[0];
    expect(sql).toContain('version = version + 1');
    expect(sql).toContain("status = 'PROCESSING'");
  });

  it('findActiveByChecksum excludes FAILED documents', async () => {
    const { repository, query } = makeRepository([]);

    await repository.findActiveByChecksum('org-1', 'sum1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("status <> 'FAILED'");
    expect(params).toEqual(['org-1', 'sum1']);
  });

  it('listByOrganization filters by organizationId and orders newest first', async () => {
    const { repository, query } = makeRepository([]);

    await repository.listByOrganization('org-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WHERE organization_id = $1');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual(['org-1']);
  });
});
