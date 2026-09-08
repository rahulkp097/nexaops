/**
 * Chat + streaming tables (Phase 8). A conversation belongs to exactly one
 * user (no shared/team conversations yet); organization_id is denormalized
 * from users.organization_id, matching document_chunks' denormalization
 * reasoning — tenant-scoped listing doesn't need a join. message_sources
 * is a join table rather than a jsonb column on messages so each cited
 * chunk keeps a real FK to document_chunks (spec §17: "Persist document
 * sources and tool execution metadata").
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('conversations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    title: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('conversations', 'organization_id');
  pgm.createIndex('conversations', ['organization_id', 'user_id']);

  pgm.createType('message_role', ['USER', 'ASSISTANT']);

  pgm.createTable('messages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: 'conversations',
      onDelete: 'CASCADE',
    },
    role: { type: 'message_role', notNull: true },
    content: { type: 'text', notNull: true },
    // Recorded on assistant messages for audit/evaluation (spec §17); null
    // on user messages.
    model: { type: 'text' },
    provider: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Conversation history is always fetched in creation order for one
  // conversation — a composite index serves that directly.
  pgm.createIndex('messages', ['conversation_id', 'created_at']);

  pgm.createTable('message_sources', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    message_id: { type: 'uuid', notNull: true, references: 'messages', onDelete: 'CASCADE' },
    // Kept even if the underlying document/chunk is later deleted or
    // reindexed — a citation on a past answer must remain inspectable.
    document_id: { type: 'uuid', references: 'documents', onDelete: 'SET NULL' },
    chunk_id: { type: 'uuid', references: 'document_chunks', onDelete: 'SET NULL' },
    filename: { type: 'text', notNull: true },
    page_number: { type: 'integer' },
    score: { type: 'real', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('message_sources', 'message_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('message_sources');
  pgm.dropTable('messages');
  pgm.dropType('message_role');
  pgm.dropTable('conversations');
};
