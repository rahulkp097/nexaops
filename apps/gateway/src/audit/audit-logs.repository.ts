import { Inject, Injectable } from '@nestjs/common';
import { PG_POOL } from '../database/pg-pool.provider';
import { Queryable } from '../database/transaction.util';
import { AuditLogRow, RecordAuditEventInput } from './audit-log.types';

@Injectable()
export class AuditLogsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Queryable) {}

  async insert(input: RecordAuditEventInput, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query(
      `INSERT INTO audit_logs (organization_id, user_id, action, resource, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.organizationId ?? null,
        input.userId ?? null,
        input.action,
        input.resource,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  async listByOrganization(
    organizationId: string,
    limit: number,
    queryable: Queryable = this.pool,
  ): Promise<AuditLogRow[]> {
    const result = await queryable.query<AuditLogRow>(
      'SELECT * FROM audit_logs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2',
      [organizationId, limit],
    );
    return result.rows;
  }
}
