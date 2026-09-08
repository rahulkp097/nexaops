export type MessageRole = 'USER' | 'ASSISTANT';

export interface ConversationRow {
  id: string;
  organization_id: string;
  user_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  provider: string | null;
  created_at: Date;
}

export interface MessageSourceRow {
  id: string;
  message_id: string;
  document_id: string | null;
  chunk_id: string | null;
  filename: string;
  page_number: number | null;
  score: number;
  created_at: Date;
}

export interface CreateConversationInput {
  id: string;
  organizationId: string;
  userId: string;
  title: string | null;
}

export interface CreateMessageInput {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  model?: string | null;
  provider?: string | null;
}

export interface CreateMessageSourceInput {
  id: string;
  messageId: string;
  documentId: string | null;
  chunkId: string | null;
  filename: string;
  pageNumber: number | null;
  score: number;
}
