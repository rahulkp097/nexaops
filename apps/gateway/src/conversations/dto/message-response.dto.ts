import { MessageResponseDto, SourceResponseDto } from '@nexaops/shared-types';
import { MessageRow, MessageSourceRow } from '../conversation.types';

// Canonical shapes live in @nexaops/shared-types (the public API contract).
export type { SourceResponseDto, MessageResponseDto } from '@nexaops/shared-types';

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
