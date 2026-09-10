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
