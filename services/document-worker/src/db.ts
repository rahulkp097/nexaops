import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_APP_URL,
  connectionTimeoutMillis: 3000,
  statement_timeout: 3000,
  max: 2,
});

export async function checkDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}
