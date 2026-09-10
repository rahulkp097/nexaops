import type { EvaluationRunDetailResponseDto, EvaluationRunResponseDto } from '@nexaops/shared-types';
import { apiFetch } from '../api-client';

export function startEvaluationRun(): Promise<EvaluationRunResponseDto> {
  return apiFetch('/evaluation/runs', { method: 'POST' });
}

export function listEvaluationRuns(): Promise<EvaluationRunResponseDto[]> {
  return apiFetch('/evaluation/runs');
}

export function getEvaluationRun(id: string): Promise<EvaluationRunDetailResponseDto> {
  return apiFetch(`/evaluation/runs/${id}`);
}
