import { QueryResult, QueryResultRow } from 'pg';

// Accepted by every repository function below so callers can pass either
// the shared pool (standalone read/write) or a transaction's PoolClient
// (so e.g. markDocumentStatus can participate in the same transaction as
// replaceDocumentChunks) — mirrors apps/gateway/src/database/transaction.util.ts's
// Queryable, not importable across workspaces.
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

export type DocumentStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface DocumentRow {
  id: string;
  organization_id: string;
  filename: string;
  storage_key: string;
  mime_type: string;
  size: number;
  version: number;
  status: DocumentStatus;
  checksum: string;
  created_at: Date;
  updated_at: Date;
}

export async function findDocumentById(pool: Queryable, id: string): Promise<DocumentRow | null> {
  const result = await pool.query<DocumentRow>('SELECT * FROM documents WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function markDocumentStatus(
  pool: Queryable,
  id: string,
  organizationId: string,
  status: DocumentStatus,
): Promise<void> {
  await pool.query(
    'UPDATE documents SET status = $3, updated_at = now() WHERE id = $1 AND organization_id = $2',
    [id, organizationId, status],
  );
}

export interface ChunkInput {
  content: string;
  pageNumber: number | null;
  section: string | null;
  metadata: Record<string, unknown>;
  embedding: number[];
}

// Idempotent by construction: deleting all of a document's existing
// chunks before inserting the fresh set means reprocessing (whether from
// a genuine reindex, a broker redelivery, or a replayed message)
// converges to the same correct end state regardless of cause.
export async function replaceDocumentChunks(
  client: Queryable,
  documentId: string,
  organizationId: string,
  chunks: ChunkInput[],
): Promise<void> {
  await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
  for (const [index, chunk] of chunks.entries()) {
    await client.query(
      `INSERT INTO document_chunks
         (document_id, organization_id, chunk_index, content, page_number, section, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        documentId,
        organizationId,
        index,
        chunk.content,
        chunk.pageNumber,
        chunk.section,
        JSON.stringify(chunk.metadata),
        `[${chunk.embedding.join(',')}]`,
      ],
    );
  }
}
