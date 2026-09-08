/**
 * Full-text search index for Phase 7's hybrid retrieval (keyword search
 * arm, alongside the existing pgvector similarity search). GIN index on
 * a functional to_tsvector expression rather than a stored generated
 * column — no migration to backfill, and node-pg-migrate's builder can't
 * express a functional index, so this drops to raw SQL (same escape
 * hatch used for the case-insensitive email index in
 * 1788706792031_create-organizations-and-users.js).
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.sql(
    "CREATE INDEX document_chunks_content_fts_idx ON document_chunks USING GIN (to_tsvector('english', content))",
  );
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql('DROP INDEX document_chunks_content_fts_idx');
};
