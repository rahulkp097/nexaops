import { findDocumentById, markDocumentStatus, Queryable, replaceDocumentChunks } from './repository';

function makeQueryable(rows: unknown[] = []) {
  const query = jest.fn().mockResolvedValue({ rows });
  return { queryable: { query } as unknown as Queryable, query };
}

describe('findDocumentById', () => {
  it('looks up by id alone (tenant verification happens by the caller comparing organization_id)', async () => {
    const { queryable, query } = makeQueryable([{ id: 'doc-1', organization_id: 'org-1' }]);

    const result = await findDocumentById(queryable, 'doc-1');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), ['doc-1']);
    expect(result?.id).toBe('doc-1');
  });

  it('resolves to null when no row matches', async () => {
    const { queryable } = makeQueryable([]);
    await expect(findDocumentById(queryable, 'missing')).resolves.toBeNull();
  });
});

describe('markDocumentStatus', () => {
  it('is scoped to both id and organizationId', async () => {
    const { queryable, query } = makeQueryable();

    await markDocumentStatus(queryable, 'doc-1', 'org-1', 'READY');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WHERE id = $1 AND organization_id = $2');
    expect(params).toEqual(['doc-1', 'org-1', 'READY']);
  });
});

describe('replaceDocumentChunks', () => {
  it('deletes existing chunks before inserting the fresh set (idempotent reprocessing)', async () => {
    const { queryable, query } = makeQueryable();

    await replaceDocumentChunks(queryable, 'doc-1', 'org-1', [
      { content: 'a', pageNumber: 1, section: null, metadata: {}, embedding: [0.1, 0.2] },
      { content: 'b', pageNumber: 1, section: null, metadata: {}, embedding: [0.3, 0.4] },
    ]);

    expect(query.mock.calls[0][0]).toContain('DELETE FROM document_chunks WHERE document_id = $1');
    expect(query.mock.calls[0][1]).toEqual(['doc-1']);
    expect(query.mock.calls).toHaveLength(3); // 1 delete + 2 inserts
    expect(query.mock.calls[1][0]).toContain('INSERT INTO document_chunks');
    expect(query.mock.calls[1][1]).toEqual([
      'doc-1',
      'org-1',
      0,
      'a',
      1,
      null,
      '{}',
      '[0.1,0.2]',
    ]);
    expect(query.mock.calls[2][1][2]).toBe(1); // second chunk's chunk_index
  });

  it('a second call fully replaces the first call\'s chunks, not accumulate', async () => {
    const { queryable, query } = makeQueryable();

    await replaceDocumentChunks(queryable, 'doc-1', 'org-1', [
      { content: 'old', pageNumber: null, section: null, metadata: {}, embedding: [0.1] },
    ]);
    query.mockClear();
    await replaceDocumentChunks(queryable, 'doc-1', 'org-1', [
      { content: 'new', pageNumber: null, section: null, metadata: {}, embedding: [0.2] },
    ]);

    // Every call starts with its own DELETE, so no accumulation is possible
    // regardless of how many times processing runs for this document.
    expect(query.mock.calls[0][0]).toContain('DELETE FROM document_chunks');
    expect(query.mock.calls[1][1]).toContain('new');
  });
});
