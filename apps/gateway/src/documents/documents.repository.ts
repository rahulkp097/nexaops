import { Inject, Injectable } from '@nestjs/common';
import { PG_POOL } from '../database/pg-pool.provider';
import { Queryable } from '../database/transaction.util';
import { CreateDocumentInput, DocumentRow, DocumentStatus } from './document.types';

@Injectable()
export class DocumentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Queryable) {}

  async create(input: CreateDocumentInput, queryable: Queryable = this.pool): Promise<DocumentRow> {
    const result = await queryable.query<DocumentRow>(
      `INSERT INTO documents (id, organization_id, filename, storage_key, mime_type, size, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.id,
        input.organizationId,
        input.filename,
        input.storageKey,
        input.mimeType,
        input.size,
        input.checksum,
      ],
    );
    return result.rows[0];
  }

  async findActiveByChecksum(
    organizationId: string,
    checksum: string,
    queryable: Queryable = this.pool,
  ): Promise<DocumentRow | null> {
    const result = await queryable.query<DocumentRow>(
      `SELECT * FROM documents
       WHERE organization_id = $1 AND checksum = $2 AND status <> 'FAILED'`,
      [organizationId, checksum],
    );
    return result.rows[0] ?? null;
  }

  // Tenant-isolation pattern (matches UsersRepository.findActiveByIdAndOrganization):
  // never fetch an org-owned row by id alone.
  async findByIdAndOrganization(
    id: string,
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<DocumentRow | null> {
    const result = await queryable.query<DocumentRow>(
      'SELECT * FROM documents WHERE id = $1 AND organization_id = $2',
      [id, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async listByOrganization(
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<DocumentRow[]> {
    const result = await queryable.query<DocumentRow>(
      'SELECT * FROM documents WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId],
    );
    return result.rows;
  }

  async markStatus(
    id: string,
    organizationId: string,
    status: DocumentStatus,
    queryable: Queryable = this.pool,
  ): Promise<DocumentRow | null> {
    const result = await queryable.query<DocumentRow>(
      `UPDATE documents SET status = $3, updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, organizationId, status],
    );
    return result.rows[0] ?? null;
  }

  async incrementVersionAndReprocess(
    id: string,
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<DocumentRow | null> {
    const result = await queryable.query<DocumentRow>(
      `UPDATE documents SET version = version + 1, status = 'PROCESSING', updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async deleteByIdAndOrganization(
    id: string,
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<DocumentRow | null> {
    const result = await queryable.query<DocumentRow>(
      'DELETE FROM documents WHERE id = $1 AND organization_id = $2 RETURNING *',
      [id, organizationId],
    );
    return result.rows[0] ?? null;
  }
}
