import { ConversationResponseDto } from '@nexaops/shared-types';
import { ConversationRow } from '../conversation.types';

// Canonical shape lives in @nexaops/shared-types (the public API contract).
export type { ConversationResponseDto } from '@nexaops/shared-types';

// Deliberately drops organization_id and user_id from the public API surface.
export function toConversationResponseDto(row: ConversationRow): ConversationResponseDto {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
