/**
 * Creates the two least-privilege Postgres roles used by the application at
 * runtime, instead of connecting as the `nexaops` superuser:
 *  - nexaops_app: read-write, used by gateway/ai-service/document-worker
 *  - nexaops_readonly: SELECT-only, used by the NL-to-SQL tool (Phase 12)
 *
 * Passwords come from DB_APP_PASSWORD / DB_READONLY_PASSWORD (never
 * committed as plain text) and are passed through node-pg-migrate's
 * `createRole`, which escapes them into the generated SQL.
 *
 * No tables exist yet (Phase 2+ create them), so this only grants
 * schema-level access plus default privileges that apply automatically to
 * every table/sequence created later — no new GRANTs needed per table.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  const appPassword = process.env.DB_APP_PASSWORD;
  const readonlyPassword = process.env.DB_READONLY_PASSWORD;

  if (!appPassword || !readonlyPassword) {
    throw new Error(
      'DB_APP_PASSWORD and DB_READONLY_PASSWORD must be set to run this migration'
    );
  }

  pgm.createRole('nexaops_app', {
    login: true,
    password: appPassword,
  });

  pgm.createRole('nexaops_readonly', {
    login: true,
    password: readonlyPassword,
  });

  // Defense in depth beyond GRANTs: hard-block writes and runaway queries
  // at the role level, ahead of Phase 12's NL-to-SQL tool using this role.
  pgm.sql('ALTER ROLE nexaops_readonly SET default_transaction_read_only = on');
  pgm.sql("ALTER ROLE nexaops_readonly SET statement_timeout = '5s'");

  pgm.sql('GRANT CONNECT ON DATABASE nexaops TO nexaops_app, nexaops_readonly');

  pgm.grantOnSchemas({
    schemas: 'public',
    roles: ['nexaops_app', 'nexaops_readonly'],
    privileges: 'USAGE',
  });

  pgm.sql(
    'ALTER DEFAULT PRIVILEGES FOR ROLE nexaops IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexaops_app'
  );
  pgm.sql(
    'ALTER DEFAULT PRIVILEGES FOR ROLE nexaops IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nexaops_app'
  );
  pgm.sql(
    'ALTER DEFAULT PRIVILEGES FOR ROLE nexaops IN SCHEMA public GRANT SELECT ON TABLES TO nexaops_readonly'
  );
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql(
    'ALTER DEFAULT PRIVILEGES FOR ROLE nexaops IN SCHEMA public REVOKE ALL ON TABLES FROM nexaops_app, nexaops_readonly'
  );
  pgm.sql(
    'ALTER DEFAULT PRIVILEGES FOR ROLE nexaops IN SCHEMA public REVOKE ALL ON SEQUENCES FROM nexaops_app'
  );
  pgm.sql('REVOKE ALL PRIVILEGES ON DATABASE nexaops FROM nexaops_app, nexaops_readonly');
  pgm.dropRole('nexaops_readonly', { ifExists: true });
  pgm.dropRole('nexaops_app', { ifExists: true });
};
