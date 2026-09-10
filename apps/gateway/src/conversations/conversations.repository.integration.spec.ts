import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { ConversationsRepository } from './conversations.repository';

// spec §30: "Question -> retrieval -> answer" and friends call for real
// integration tests, not just unit tests against a mocked `query`
// function — this is the gateway's own DB layer against a real Postgres
// connection. Run with `npm run test:integration --workspace=apps/gateway`
// once `docker compose up -d` is running; jest.config.js's testRegex
// (`*.spec.ts`, not `*.integration.spec.ts`) already excludes this file
// from the default `npm test`.
const DATABASE_APP_URL =
  process.env.DATABASE_APP_URL ?? 'postgresql://nexaops_app:dev-app-password@localhost:55432/nexaops';

describe('ConversationsRepository (integration)', () => {
  let pool: Pool;
  let repository: ConversationsRepository;
  let organizationId: string;
  let userId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_APP_URL });
    repository = new ConversationsRepository(pool);

    organizationId = randomUUID();
    userId = randomUUID();
    await pool.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [
      organizationId,
      'Integration Test Org',
    ]);
    await pool.query(
      `INSERT INTO users (id, organization_id, email, password_hash, role)
       VALUES ($1, $2, $3, 'not-a-real-hash', 'ADMIN')`,
      [userId, organizationId, `integration-${userId}@example.com`],
    );
  });

  afterAll(async () => {
    // ON DELETE CASCADE takes the user, and every conversation/message
    // created below, with it.
    await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    await pool.end();
  });

  it('persists a conversation and a message, and reads them back through real Postgres', async () => {
    const conversation = await repository.createConversation({
      id: randomUUID(),
      organizationId,
      userId,
      title: 'Integration test conversation',
    });

    const found = await repository.findByIdAndOrganization(conversation.id, organizationId);
    expect(found?.id).toBe(conversation.id);
    expect(found?.summary).toBeNull();
    expect(found?.summarized_message_count).toBe(0);

    const message = await repository.createMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      role: 'USER',
      content: 'Hello from an integration test',
    });

    const messages = await repository.listByConversation(conversation.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(message.id);
    expect(messages[0].content).toBe('Hello from an integration test');
  });

  it('never finds a conversation scoped to a different organization', async () => {
    const conversation = await repository.createConversation({
      id: randomUUID(),
      organizationId,
      userId,
      title: null,
    });

    const found = await repository.findByIdAndOrganization(conversation.id, randomUUID());

    expect(found).toBeNull();
  });
});
