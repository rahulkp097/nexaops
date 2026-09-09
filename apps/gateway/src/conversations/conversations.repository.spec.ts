import { ConversationsRepository } from './conversations.repository';
import { Queryable } from '../database/transaction.util';

function makeRepository(rows: unknown[]) {
  const query = jest.fn().mockResolvedValue({ rows });
  const repository = new ConversationsRepository({ query } as unknown as Queryable);
  return { repository, query };
}

describe('ConversationsRepository', () => {
  it('createConversation binds an explicit id (not left to a DB default)', async () => {
    const { repository, query } = makeRepository([{ id: 'conv-1' }]);

    await repository.createConversation({
      id: 'conv-1',
      organizationId: 'org-1',
      userId: 'user-1',
      title: 'Refund questions',
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), ['conv-1', 'org-1', 'user-1', 'Refund questions']);
  });

  it('findByIdAndOrganization binds both id and organizationId — proves cross-tenant lookups by id alone are impossible', async () => {
    const { repository, query } = makeRepository([{ id: 'conv-1', organization_id: 'org-1' }]);

    await repository.findByIdAndOrganization('conv-1', 'org-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('organization_id = $2');
    expect(params).toEqual(['conv-1', 'org-1']);
  });

  it('resolves to null when the conversation id exists but belongs to a different organization', async () => {
    const { repository } = makeRepository([]);

    const result = await repository.findByIdAndOrganization('conv-1', 'some-other-org');

    expect(result).toBeNull();
  });

  it('listByOrganizationAndUser filters by both organizationId and userId, newest-updated first', async () => {
    const { repository, query } = makeRepository([]);

    await repository.listByOrganizationAndUser('org-1', 'user-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('organization_id = $1');
    expect(sql).toContain('user_id = $2');
    expect(sql).toContain('ORDER BY updated_at DESC');
    expect(params).toEqual(['org-1', 'user-1']);
  });

  it('listByConversation orders messages oldest first', async () => {
    const { repository, query } = makeRepository([]);

    await repository.listByConversation('conv-1');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(params).toEqual(['conv-1']);
  });

  it('listRecentByConversation limits to the most recent N but returns them oldest first', async () => {
    const { repository, query } = makeRepository([]);

    await repository.listRecentByConversation('conv-1', 10);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC LIMIT $2');
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(params).toEqual(['conv-1', 10]);
  });

  it('countMessagesByConversation returns the total as a number', async () => {
    const { repository, query } = makeRepository([{ count: '11' }]);

    const result = await repository.countMessagesByConversation('conv-1');

    expect(query).toHaveBeenCalledWith(expect.any(String), ['conv-1']);
    expect(result).toBe(11);
  });

  it('listMessageRange orders oldest first and binds offset/limit', async () => {
    const { repository, query } = makeRepository([]);

    await repository.listMessageRange('conv-1', 5, 3);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(sql).toContain('OFFSET $2 LIMIT $3');
    expect(params).toEqual(['conv-1', 5, 3]);
  });

  it('updateSummary binds the conversation id, summary text, and count', async () => {
    const { repository, query } = makeRepository([]);

    await repository.updateSummary('conv-1', 'a running summary', 4);

    expect(query).toHaveBeenCalledWith(expect.any(String), ['conv-1', 'a running summary', 4]);
  });

  it('createMessageSources inserts one row per source and returns them all', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'src-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'src-2' }] });
    const repository = new ConversationsRepository({ query } as unknown as Queryable);

    const result = await repository.createMessageSources([
      {
        id: 'src-1',
        messageId: 'msg-1',
        documentId: 'doc-1',
        chunkId: 'chunk-1',
        filename: 'policy.pdf',
        pageNumber: 4,
        score: 0.9,
      },
      {
        id: 'src-2',
        messageId: 'msg-1',
        documentId: 'doc-2',
        chunkId: 'chunk-2',
        filename: 'terms.txt',
        pageNumber: null,
        score: 0.8,
      },
    ]);

    expect(query).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ id: 'src-1' }, { id: 'src-2' }]);
  });

  it('listSourcesByMessageIds returns an empty array without querying when given no ids', async () => {
    const { repository, query } = makeRepository([]);

    const result = await repository.listSourcesByMessageIds([]);

    expect(result).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('listSourcesByMessageIds queries with ANY($1) over the given ids', async () => {
    const { repository, query } = makeRepository([]);

    await repository.listSourcesByMessageIds(['msg-1', 'msg-2']);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ANY($1)');
    expect(params).toEqual([['msg-1', 'msg-2']]);
  });
});
