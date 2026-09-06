/**
 * Security-sensitive-operation audit trail (register/login/logout/refresh
 * reuse detection). organization_id/user_id are nullable to allow logging
 * events like a failed login against an unknown email.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('audit_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', references: 'organizations', onDelete: 'SET NULL' },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    action: { type: 'text', notNull: true },
    resource: { type: 'text', notNull: true },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('audit_logs', 'organization_id');
  pgm.createIndex('audit_logs', 'user_id');
  pgm.createIndex('audit_logs', 'action');
  pgm.createIndex('audit_logs', 'created_at');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('audit_logs');
};
