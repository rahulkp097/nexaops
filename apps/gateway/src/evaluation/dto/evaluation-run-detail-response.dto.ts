import { EvaluationRunDetailResponseDto } from '@nexaops/shared-types';
import { EvaluationCaseResultRow, EvaluationRunRow } from '../evaluation.types';
import { toEvaluationCaseResultResponseDto } from './evaluation-case-result-response.dto';
import { toEvaluationRunResponseDto } from './evaluation-run-response.dto';

// Canonical shape lives in @nexaops/shared-types (the public API contract).
export type { EvaluationRunDetailResponseDto } from '@nexaops/shared-types';

export function toEvaluationRunDetailResponseDto(
  run: EvaluationRunRow,
  results: EvaluationCaseResultRow[],
): EvaluationRunDetailResponseDto {
  return {
    ...toEvaluationRunResponseDto(run),
    results: results.map(toEvaluationCaseResultResponseDto),
  };
}
