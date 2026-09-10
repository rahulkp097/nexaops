export type MessageRole = 'USER' | 'ASSISTANT';

export interface ConversationResponseDto {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConversationRequest {
  title?: string;
}

export interface CreateMessageRequest {
  content: string;
}

export interface SourceResponseDto {
  documentId: string | null;
  chunkId: string | null;
  filename: string;
  page: number | null;
  score: number;
}

export interface MessageResponseDto {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
  sources: SourceResponseDto[];
}

// Phase 25: shapes for GET /v1/conversations/:id/stream's SSE events —
// mirrors apps/gateway/src/conversations/chat-stream.registry.ts's
// ChatSseEventType and apps/gateway/src/conversations/ai-service/
// ai-service-rag.client.ts's RagSourceEventData/RagTokenEventData. Kept out
// of scope in Phase 24 (no consumer existed yet); the frontend is that
// consumer.
export interface ChatMessageStartEventData {
  conversationId: string;
  messageId: string;
}

export interface ChatSourceEventData {
  documentId: string;
  chunkId: string;
  filename: string;
  page: number | null;
  score: number;
}

export interface ChatTokenEventData {
  text: string;
}

export interface ChatErrorEventData {
  message: string;
  retryable: boolean;
}

export type ChatStreamEvent =
  | { event: 'message_start'; data: ChatMessageStartEventData }
  | { event: 'source'; data: ChatSourceEventData }
  | { event: 'token'; data: ChatTokenEventData }
  | { event: 'message_complete'; data: MessageResponseDto }
  | { event: 'error'; data: ChatErrorEventData };
