import { EvaluationRunResponseDto } from '@nexaops/shared-types';
import { EvaluationRunRow } from '../evaluation.types';

// Canonical shape lives in @nexaops/shared-types (the public API contract).
export type { EvaluationRunResponseDto } from '@nexaops/shared-types';

// Deliberately drops organization_id/triggered_by_user_id — the caller
// already scoped the query to their own organization, same convention as
// toAuditLogResponseDto.
export function toEvaluationRunResponseDto(row: EvaluationRunRow): EvaluationRunResponseDto {
  return {
    id: row.id,
    status: row.status,
    model: row.model,
    provider: row.provider,
    metrics: row.metrics,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}
