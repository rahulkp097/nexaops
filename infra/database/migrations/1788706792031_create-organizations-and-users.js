/**
 * Core tenancy tables for Phase 2 (auth/RBAC): every org-owned resource in
 * later phases carries organization_id and is filtered by it — see
 * docs spec §8 (Tenant Isolation). Email is globally unique because
 * POST /auth/login has no organization selector in the API contract.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('organizations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createType('user_role', ['ADMIN', 'MANAGER', 'EMPLOYEE']);

  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    email: { type: 'text', notNull: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'user_role', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'ACTIVE',
      check: "status IN ('ACTIVE', 'DISABLED')",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Case-insensitive global uniqueness; the builder can't express a
  // functional index, so this drops to raw SQL (same escape hatch used in
  // 1788459208557_create-db-roles-and-grants.js).
  pgm.sql('CREATE UNIQUE INDEX users_email_unique_idx ON users (lower(email))');
  pgm.createIndex('users', 'organization_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('users');
  pgm.dropType('user_role');
  pgm.dropTable('organizations');
};
