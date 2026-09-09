import { EvaluationRunRow, EvaluationRunStatus } from '../evaluation.types';

export interface EvaluationRunResponseDto {
  id: string;
  status: EvaluationRunStatus;
  model: string | null;
  provider: string | null;
  metrics: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

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
