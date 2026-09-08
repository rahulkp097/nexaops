import { MessageRole, MessageRow, MessageSourceRow } from '../conversation.types';

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

export function toSourceResponseDto(row: MessageSourceRow): SourceResponseDto {
  return {
    documentId: row.document_id,
    chunkId: row.chunk_id,
    filename: row.filename,
    page: row.page_number,
    score: row.score,
  };
}

// Deliberately drops conversation_id from the public API surface.
export function toMessageResponseDto(row: MessageRow, sources: MessageSourceRow[] = []): MessageResponseDto {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    sources: sources.map(toSourceResponseDto),
  };
}
