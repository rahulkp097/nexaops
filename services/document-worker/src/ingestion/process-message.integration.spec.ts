import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pool } from '../db';

// spec §30: "Upload -> RabbitMQ -> worker -> PostgreSQL/pgvector" against
// real infra. The RabbitMQ hop itself is thin plumbing already covered by
// consumer.spec.ts's mocked tests; this exercises the part actually worth
// integration-testing — real extraction, real chunking, and the real
// transactional replace-chunks write against a real Postgres — without a
// document ever going through the real upload/publish flow.
//
// embedTexts is the one thing still mocked here, not skipped for
// convenience: @xenova/transformers' ONNX runtime allocates its tensors
// against the global Float32Array of whichever realm loaded it, and Jest
// (even with testEnvironment: 'node') runs each test file in its own VM
// context/realm — the runtime's own `instanceof Float32Array` check then
// fails across that realm boundary ("A float32 tensor's data must be type
// of function Float32Array()"), independent of anything in this project's
// own code. Real embedding generation through this exact pipeline is
// already live-verified against the real running container in every
// phase since Phase 4 (most recently Phase 19); this test covers the
// surrounding real-Postgres path that Jest *can* exercise reliably.
jest.mock('../model/embeddings', () => ({
  embedTexts: jest.fn(async (texts: string[]) => texts.map(() => new Array(384).fill(0.01))),
}));

import { processIngestionMessage } from './process-message';

const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_PATH as string);

describe('processIngestionMessage (integration)', () => {
  let organizationId: string;
  let documentId: string;
  let storageKey: string;

  beforeAll(async () => {
    organizationId = randomUUID();
    documentId = randomUUID();
    storageKey = `${documentId}.txt`;

    await fs.mkdir(STORAGE_ROOT, { recursive: true });
    await fs.writeFile(
      path.join(STORAGE_ROOT, storageKey),
      'Refunds are issued within 30 days of purchase.\n\nOur warehouse is located in Springfield.',
      'utf-8',
    );

    await pool.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [
      organizationId,
      'Ingestion Integration Test Org',
    ]);
    await pool.query(
      `INSERT INTO documents (id, organization_id, filename, storage_key, mime_type, size, checksum, status)
       VALUES ($1, $2, 'fixture.txt', $3, 'text/plain', 1, 'fixture-checksum', 'PROCESSING')`,
      [documentId, organizationId, storageKey],
    );
  }, 30_000);

  afterAll(async () => {
    // ON DELETE CASCADE takes the document and its chunks with it.
    await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    await fs.rm(path.join(STORAGE_ROOT, storageKey), { force: true });
    await pool.end();
  });

  it(
    'extracts and chunks a real file into real document_chunks, marks the document READY, ' +
      'and reprocessing replaces rather than duplicates chunks',
    async () => {
      await processIngestionMessage({ documentId, organizationId, jobId: randomUUID() });

      const afterFirstRun = await pool.query(
        'SELECT content FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index',
        [documentId],
      );
      expect(afterFirstRun.rows.length).toBeGreaterThan(0);
      expect(afterFirstRun.rows.some((row: { content: string }) => row.content.includes('30 days'))).toBe(true);

      const statusAfterFirstRun = await pool.query('SELECT status FROM documents WHERE id = $1', [documentId]);
      expect(statusAfterFirstRun.rows[0].status).toBe('READY');

      // Idempotency (spec §4/§30): reprocessing the same document deletes
      // and reinserts its chunks rather than appending duplicates.
      await processIngestionMessage({ documentId, organizationId, jobId: randomUUID() });
      const afterSecondRun = await pool.query(
        'SELECT COUNT(*) AS count FROM document_chunks WHERE document_id = $1',
        [documentId],
      );
      expect(Number(afterSecondRun.rows[0].count)).toBe(afterFirstRun.rows.length);
    },
    30_000,
  );
});
