import type {
  ChatStreamEvent,
  ConversationResponseDto,
  CreateConversationRequest,
  MessageResponseDto,
} from '@nexaops/shared-types';
import { API_BASE_URL, apiFetch } from '../api-client';
import { readSseStream } from '../sse';
import { getAccessToken } from '../token-storage';

export function createConversation(payload: CreateConversationRequest = {}): Promise<ConversationResponseDto> {
  return apiFetch('/conversations', { method: 'POST', body: payload });
}

export function listConversations(): Promise<ConversationResponseDto[]> {
  return apiFetch('/conversations');
}

export function getConversation(id: string): Promise<ConversationResponseDto> {
  return apiFetch(`/conversations/${id}`);
}

export function listMessages(conversationId: string): Promise<MessageResponseDto[]> {
  return apiFetch(`/conversations/${conversationId}/messages`);
}

export function postMessage(conversationId: string, content: string): Promise<MessageResponseDto> {
  return apiFetch(`/conversations/${conversationId}/messages`, { method: 'POST', body: { content } });
}

// Not routed through apiFetch: this is a long-lived streaming GET, not a
// one-shot JSON request, and needs the raw Response.body reader. Native
// EventSource can't attach an Authorization header, so this uses fetch +
// manual SSE parsing instead — the same approach
// scripts/e2e-smoke-test.mjs already validates against the real backend.
export async function* streamConversation(conversationId: string): AsyncGenerator<ChatStreamEvent> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/stream`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 404) {
    // Generation already finished and its replay window was evicted (Phase
    // 8's own documented rough edge) — nothing to stream, not an error.
    return;
  }
  if (!response.ok || !response.body) {
    throw new Error(`Stream request failed with status ${response.status}`);
  }
  for await (const { event, data } of readSseStream(response.body)) {
    yield { event, data: JSON.parse(data) } as ChatStreamEvent;
  }
}
