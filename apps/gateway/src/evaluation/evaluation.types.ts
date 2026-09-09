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

export interface EvaluationCaseRow {
  id: string;
  organization_id: string;
  category: EvaluationCategory;
  question: string;
  expected_answer_contains: string | null;
  expected_sources: string[];
  expected_tool_names: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface EvaluationRunRow {
  id: string;
  organization_id: string;
  triggered_by_user_id: string | null;
  model: string | null;
  provider: string | null;
  status: EvaluationRunStatus;
  metrics: Record<string, unknown> | null;
  error: string | null;
  started_at: Date;
  completed_at: Date | null;
}

export interface EvaluationCaseResultRow {
  id: string;
  run_id: string;
  case_id: string;
  category: EvaluationCategory;
  question: string;
  passed: boolean;
  latency_ms: number;
  answer: string | null;
  scores: Record<string, unknown>;
  error: string | null;
  created_at: Date;
}

export interface CreateRunInput {
  id: string;
  organizationId: string;
  triggeredByUserId: string;
}

export interface CompleteRunInput {
  status: 'COMPLETED' | 'FAILED';
  model?: string | null;
  provider?: string | null;
  metrics?: Record<string, unknown> | null;
  error?: string | null;
}

export interface CreateCaseResultInput {
  id: string;
  runId: string;
  caseId: string;
  category: EvaluationCategory;
  question: string;
  passed: boolean;
  latencyMs: number;
  answer: string | null;
  scores: Record<string, unknown>;
  error: string | null;
}
