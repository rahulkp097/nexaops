import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRequestId } from '../../observability/http-headers.util';
import { RequestContextService } from '../../observability/request-context.service';
import { readSseStream } from './sse.util';

export interface RagHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type RagStreamEventName = 'source' | 'token' | 'done' | 'error';

export interface RagSourceEventData {
  documentId: string;
  chunkId: string;
  filename: string;
  page: number | null;
  score: number;
}

export interface RagTokenEventData {
  text: string;
}

export interface RagDoneEventData {
  answer: string;
  model: string;
  provider: string;
}

export interface RagErrorEventData {
  message: string;
  retryable: boolean;
}

export type RagStreamEvent =
  | { event: 'source'; data: RagSourceEventData }
  | { event: 'token'; data: RagTokenEventData }
  | { event: 'done'; data: RagDoneEventData }
  | { event: 'error'; data: RagErrorEventData };

// Phase 19 (spec §28: "Timeouts on external/model calls"): generous
// because this measures total time since the request started, including
// however long token generation actually takes — not idle time between
// chunks — but still bounded, so a hung ai-service connection fails
// loudly instead of leaving the request (and the chat-stream slot it
// holds) open indefinitely.
const RAG_REQUEST_TIMEOUT_MS = 120_000;

@Injectable()
export class AiServiceRagClient {
  constructor(
    private readonly config: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {}

  // Streams apps/ai-service's POST /rag/query/stream. The pipeline
  // (embed -> hybrid retrieve -> LLM) already ran once per Phase 6/7; this
  // is the same call, just consumed as an event stream instead of waiting
  // for one blocking JSON response.
  async *streamQuery(input: {
    question: string;
    organizationId: string;
    history: RagHistoryMessage[];
    // Phase 16: a rolling summary of turns older than `history`'s window,
    // omitted (rather than sent as null) until a conversation has any.
    conversationSummary?: string | null;
  }): AsyncGenerator<RagStreamEvent> {
    const baseUrl = this.config.get<string>('AI_SERVICE_URL') ?? 'http://localhost:8000';
    const response = await fetch(`${baseUrl}/rag/query/stream`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json' }, this.requestContext),
      body: JSON.stringify({
        question: input.question,
        organizationId: input.organizationId,
        history: input.history,
        conversationSummary: input.conversationSummary ?? undefined,
      }),
      signal: AbortSignal.timeout(RAG_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`AI service request failed with status ${response.status}`);
    }
    if (!response.body) {
      throw new Error('AI service returned an empty response body');
    }

    for await (const { event, data } of readSseStream(response.body)) {
      yield { event, data: JSON.parse(data) } as RagStreamEvent;
    }
  }
}
