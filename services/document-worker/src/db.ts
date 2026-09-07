import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_APP_URL,
  connectionTimeoutMillis: 5000,
  // Was 3000ms/max 2 — tuned only for the lightweight health-check SELECT
  // 1. Real ingestion transactions (chunk delete+insert) need more room,
  // and prefetch(10) means up to 10 messages can be processed concurrently.
  statement_timeout: 30000,
  max: 10,
});

export async function checkDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}

// Local copy of apps/gateway/src/database/transaction.util.ts's
// withTransaction — not importable across workspaces.
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
