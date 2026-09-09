import { EvaluationCaseResultRow, EvaluationCategory } from '../evaluation.types';

export interface EvaluationCaseResultResponseDto {
  id: string;
  caseId: string;
  category: EvaluationCategory;
  question: string;
  passed: boolean;
  latencyMs: number;
  answer: string | null;
  scores: Record<string, unknown>;
  error: string | null;
  createdAt: Date;
}

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
