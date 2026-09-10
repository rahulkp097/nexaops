import { EvaluationCaseResultResponseDto } from '@nexaops/shared-types';
import { EvaluationCaseResultRow } from '../evaluation.types';

// Canonical shape lives in @nexaops/shared-types (the public API contract).
export type { EvaluationCaseResultResponseDto } from '@nexaops/shared-types';

export function toEvaluationCaseResultResponseDto(row: EvaluationCaseResultRow): EvaluationCaseResultResponseDto {
  return {
    id: row.id,
    caseId: row.case_id,
    category: row.category,
    question: row.question,
    passed: row.passed,
    latencyMs: row.latency_ms,
    answer: row.answer,
    scores: row.scores,
    error: row.error,
    createdAt: row.created_at,
  };
}
