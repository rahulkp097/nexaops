export type MessageRole = 'USER' | 'ASSISTANT';

export interface ConversationRow {
  id: string;
  organization_id: string;
  user_id: string;
  title: string | null;
  // Phase 16: a rolling summary of messages older than the bounded
  // recent-message window (CONVERSATION_HISTORY_LIMIT), null until a
  // conversation is long enough to have any summarized messages.
  summary: string | null;
  // How many of this conversation's oldest messages are already folded
  // into `summary` — lets the next summarization pick up only the newly
  // aged-out slice instead of resummarizing from scratch.
  summarized_message_count: number;
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
