// Mirrors the ai-service Literal in app/evaluation/types.py and the
// Postgres enum `evaluation_case_category`.
export type EvaluationCategory =
  | 'DOCUMENT_QA'
  | 'NO_ANSWER'
  | 'EXACT_ID'
  | 'MULTI_HOP'
  | 'SQL'
  | 'BUSINESS_API'
  | 'COMBINED'
  | 'AGENT_MULTI_STEP'
  | 'PROMPT_INJECTION'
  | 'CROSS_TENANT';

export type EvaluationRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

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

export interface EvaluationRunDetailResponseDto extends EvaluationRunResponseDto {
  results: EvaluationCaseResultResponseDto[];
}
