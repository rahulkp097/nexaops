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

// Shapes for GET /v1/conversations/:id/stream's SSE events — mirrors
// apps/gateway/src/conversations/chat-stream.registry.ts's ChatSseEventType
// and apps/gateway/src/conversations/ai-service/ai-service-agent.client.ts's
// event data types (real chat runs through the agent/tool-calling loop, not
// a plain RAG pipeline — see BUILD_PLAN.md's "wire chat to the agent loop"
// note for why).
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

// Real chat now runs through the bounded agent/tool-calling loop (spec
// §22) instead of a plain RAG pipeline — these two mirror
// apps/gateway/src/conversations/ai-service/ai-service-agent.client.ts's
// AgentToolCallStartedData/AgentToolCallFinishedData, surfacing tool
// activity in the chat UI per spec §34.
export interface ChatToolCallStartedEventData {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatToolCallFinishedEventData {
  name: string;
  ok: boolean;
  result: Record<string, unknown> | null;
  errorCode: string | null;
}

export interface ChatErrorEventData {
  message: string;
  retryable: boolean;
}

export type ChatStreamEvent =
  | { event: 'message_start'; data: ChatMessageStartEventData }
  | { event: 'source'; data: ChatSourceEventData }
  | { event: 'token'; data: ChatTokenEventData }
  | { event: 'tool_call_started'; data: ChatToolCallStartedEventData }
  | { event: 'tool_call_finished'; data: ChatToolCallFinishedEventData }
  | { event: 'message_complete'; data: MessageResponseDto }
  | { event: 'error'; data: ChatErrorEventData };
