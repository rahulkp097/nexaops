/**
 * Chunks + embeddings for RAG retrieval (Phase 4/5). embedding is
 * vector(384), locked to Xenova/all-MiniLM-L6-v2's fixed output
 * dimension — changing embedding models later requires a new column/table,
 * not just a config change. organization_id is denormalized from
 * documents.organization_id so tenant-filtered vector search (spec's
 * example: `WHERE organization_id = :org ORDER BY embedding <=> :q`)
 * doesn't need a join.
 *
 * No ANN index (ivfflat/hnsw) yet: the table is empty at migration time
 * and such indexes degrade badly if built before data exists. Brute-force
 * `<=>` scan is fine at MVP scale; add an ANN index in a later phase once
 * real document volume exists.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('document_chunks', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    document_id: { type: 'uuid', notNull: true, references: 'documents', onDelete: 'CASCADE' },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    chunk_index: { type: 'integer', notNull: true },
    content: { type: 'text', notNull: true },
    page_number: { type: 'integer' },
    section: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    embedding: { type: 'vector(384)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Ingestion (re)processing deletes-then-reinserts all chunks for a
  // document in one pass — this is what makes reprocessing idempotent.
  pgm.createIndex('document_chunks', 'document_id');
  pgm.createIndex('document_chunks', 'organization_id');
  pgm.createIndex('document_chunks', ['document_id', 'chunk_index'], { unique: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('document_chunks');
};
