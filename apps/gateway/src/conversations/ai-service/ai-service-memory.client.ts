import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RagHistoryMessage } from './ai-service-rag.client';

@Injectable()
export class AiServiceMemoryClient {
  constructor(private readonly config: ConfigService) {}

  // Calls apps/ai-service's POST /memory/summarize (Phase 16): folds the
  // given messages into (or starts) a running conversation summary.
  async summarize(input: { previousSummary: string | null; messages: RagHistoryMessage[] }): Promise<string> {
    const baseUrl = this.config.get<string>('AI_SERVICE_URL') ?? 'http://localhost:8000';
    const response = await fetch(`${baseUrl}/memory/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        previousSummary: input.previousSummary,
        messages: input.messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI service request failed with status ${response.status}`);
    }

    const body = (await response.json()) as { summary: string };
    return body.summary;
  }
}
