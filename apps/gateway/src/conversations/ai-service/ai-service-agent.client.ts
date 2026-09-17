import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRequestId } from '../../observability/http-headers.util';
import { RequestContextService } from '../../observability/request-context.service';
import { HistoryMessage } from './history-message.type';
import { readSseStream } from './sse.util';

export interface AgentToolCallStartedData {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentToolCallFinishedData {
  name: string;
  ok: boolean;
  result: Record<string, unknown> | null;
  errorCode: string | null;
}

export interface AgentToolCallTraceData {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  result: Record<string, unknown> | null;
  errorCode: string | null;
}

export interface AgentDoneData {
  answer: string;
  stoppedReason: string;
  iterations: number;
  toolCalls: AgentToolCallTraceData[];
  model: string;
  provider: string;
}

export interface AgentErrorData {
  message: string;
  retryable: boolean;
}

export type AgentStreamEvent =
  | { event: 'tool_call_started'; data: AgentToolCallStartedData }
  | { event: 'tool_call_finished'; data: AgentToolCallFinishedData }
  | { event: 'done'; data: AgentDoneData }
  | { event: 'error'; data: AgentErrorData };

// The agent loop's own wall-clock budget (agent_timeout_seconds, 45s by
// default) only bounds the LLM call segments — tool execution (up to
// agent_max_tool_calls calls, each with its own up-to-15s timeout) happens
// outside that budget, so the real worst-case wall clock for a full run
// is meaningfully longer than the RAG streaming client's 120s. Generous
// on purpose rather than tuned to the exact bound arithmetic, which would
// silently drift out of sync with app/core/config.py's own defaults.
const AGENT_REQUEST_TIMEOUT_MS = 180_000;

@Injectable()
export class AiServiceAgentClient {
  constructor(
    private readonly config: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {}

  // Streams apps/ai-service's POST /agent/run/stream — the bounded
  // "LLM -> tool -> more steps? -> LLM" loop (Phase 13), wired into real
  // chat for the first time (previously only reachable through the
  // standalone, non-streaming /agent/run endpoint).
  async *streamRun(input: {
    question: string;
    organizationId: string;
    userId: string;
    role: string;
    history: HistoryMessage[];
    conversationSummary?: string | null;
  }): AsyncGenerator<AgentStreamEvent> {
    const baseUrl = this.config.get<string>('AI_SERVICE_URL') ?? 'http://localhost:8000';
    const response = await fetch(`${baseUrl}/agent/run/stream`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json' }, this.requestContext),
      body: JSON.stringify({
        question: input.question,
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        history: input.history,
        conversationSummary: input.conversationSummary ?? undefined,
      }),
      signal: AbortSignal.timeout(AGENT_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`AI service request failed with status ${response.status}`);
    }
    if (!response.body) {
      throw new Error('AI service returned an empty response body');
    }

    for await (const { event, data } of readSseStream(response.body)) {
      yield { event, data: JSON.parse(data) } as AgentStreamEvent;
    }
  }
}
