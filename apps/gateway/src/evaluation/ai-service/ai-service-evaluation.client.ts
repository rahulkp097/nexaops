import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRequestId } from '../../observability/http-headers.util';
import { RequestContextService } from '../../observability/request-context.service';
import { EvaluationCaseRow, EvaluationCategory } from '../evaluation.types';

export interface EvaluationCaseResultPayload {
  caseId: string;
  category: EvaluationCategory;
  question: string;
  passed: boolean;
  latencyMs: number;
  answer: string | null;
  scores: Record<string, unknown>;
  error: string | null;
}

export interface RunEvaluationPayload {
  results: EvaluationCaseResultPayload[];
  metrics: Record<string, unknown>;
  model: string;
  provider: string;
}

@Injectable()
export class AiServiceEvaluationClient {
  constructor(
    private readonly config: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {}

  // Calls apps/ai-service's POST /evaluation/run (Phase 17): executes every
  // case against its matching pipeline and scores it — a single case's LLM
  // error never surfaces as a non-200 here (see app/api/evaluation.py), so
  // a thrown error from this method means the whole call failed (ai-service
  // unreachable, malformed request), not that one case failed.
  async run(input: {
    organizationId: string;
    userId: string;
    role: string;
    cases: EvaluationCaseRow[];
  }): Promise<RunEvaluationPayload> {
    const baseUrl = this.config.get<string>('AI_SERVICE_URL') ?? 'http://localhost:8000';
    const response = await fetch(`${baseUrl}/evaluation/run`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json' }, this.requestContext),
      body: JSON.stringify({
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        cases: input.cases.map((row) => ({
          id: row.id,
          category: row.category,
          question: row.question,
          expectedAnswerContains: row.expected_answer_contains,
          expectedSources: row.expected_sources,
          expectedToolNames: row.expected_tool_names,
          metadata: row.metadata,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`AI service request failed with status ${response.status}`);
    }

    return (await response.json()) as RunEvaluationPayload;
  }
}
