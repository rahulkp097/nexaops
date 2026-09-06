/**
 * Documents uploaded for RAG ingestion (Phase 4 consumes these via the
 * `nexaops.ingestion` RabbitMQ exchange). mime_type is restricted to the
 * exact set Phase 4's extractors support (PDF/DOCX/TXT) — the CHECK is a
 * DB-level backstop for the app-layer allowlist in documents.constants.ts.
 * size is `integer` (not `bigint`): `pg` returns int8 columns as JS
 * strings, which would silently turn API responses' size into a string.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

const MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createType('document_status', ['PROCESSING', 'READY', 'FAILED']);

  pgm.createTable('documents', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    filename: { type: 'text', notNull: true },
    storage_key: { type: 'text', notNull: true },
    mime_type: {
      type: 'text',
      notNull: true,
      check: `mime_type IN (${MIME_TYPES.map((m) => `'${m}'`).join(', ')})`,
    },
    size: { type: 'integer', notNull: true },
    version: { type: 'integer', notNull: true, default: 1 },
    status: { type: 'document_status', notNull: true, default: 'PROCESSING' },
    checksum: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('documents', 'organization_id');

  // Content-addressed idempotency: re-uploading identical bytes for the
  // same org returns the existing (non-FAILED) document instead of a
  // duplicate row/file/ingestion job. Excludes FAILED so a failed upload
  // can be retried and produce a fresh row.
  pgm.createIndex('documents', ['organization_id', 'checksum'], {
    unique: true,
    where: "status <> 'FAILED'",
    name: 'documents_org_checksum_active_unique_idx',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('documents');
  pgm.dropType('document_status');
};
