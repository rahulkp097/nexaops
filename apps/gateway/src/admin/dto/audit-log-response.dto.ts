import { AuditLogRow } from '../../audit/audit-log.types';

export interface AuditLogResponseDto {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// Deliberately drops organization_id: the caller already scoped the query
// to their own organization, so echoing it back is redundant.
export function toAuditLogResponseDto(row: AuditLogRow): AuditLogResponseDto {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    resource: row.resource,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}
