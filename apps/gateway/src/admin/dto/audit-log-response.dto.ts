import { AuditLogResponseDto } from '@nexaops/shared-types';
import { AuditLogRow } from '../../audit/audit-log.types';

// Canonical shape lives in @nexaops/shared-types (the public API contract).
export type { AuditLogResponseDto } from '@nexaops/shared-types';

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
