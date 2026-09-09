import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withRequestId } from '../../observability/http-headers.util';
import { RequestContextService } from '../../observability/request-context.service';
import { RagHistoryMessage } from './ai-service-rag.client';

// Phase 19 (spec §28: "Timeouts on external/model calls"): a short,
// non-streaming call bounded well under a minute in practice
// (memory_summary_max_tokens is 400) — this failing should surface
// quickly, not hold up the message it's summarizing alongside.
const SUMMARIZE_REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class AiServiceMemoryClient {
  constructor(
    private readonly config: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {}

  // Calls apps/ai-service's POST /memory/summarize (Phase 16): folds the
  // given messages into (or starts) a running conversation summary.
  async summarize(input: { previousSummary: string | null; messages: RagHistoryMessage[] }): Promise<string> {
    const baseUrl = this.config.get<string>('AI_SERVICE_URL') ?? 'http://localhost:8000';
    const response = await fetch(`${baseUrl}/memory/summarize`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json' }, this.requestContext),
      body: JSON.stringify({
        previousSummary: input.previousSummary,
        messages: input.messages,
      }),
      signal: AbortSignal.timeout(SUMMARIZE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`AI service request failed with status ${response.status}`);
    }

    const body = (await response.json()) as { summary: string };
    return body.summary;
  }
}
