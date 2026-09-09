import { EvaluationCaseResultRow, EvaluationRunRow } from '../evaluation.types';
import {
  EvaluationCaseResultResponseDto,
  toEvaluationCaseResultResponseDto,
} from './evaluation-case-result-response.dto';
import { EvaluationRunResponseDto, toEvaluationRunResponseDto } from './evaluation-run-response.dto';

export interface EvaluationRunDetailResponseDto extends EvaluationRunResponseDto {
  results: EvaluationCaseResultResponseDto[];
}

export function toEvaluationRunDetailResponseDto(
  run: EvaluationRunRow,
  results: EvaluationCaseResultRow[],
): EvaluationRunDetailResponseDto {
  return {
    ...toEvaluationRunResponseDto(run),
    results: results.map(toEvaluationCaseResultResponseDto),
  };
}
