import { ConversationRow } from '../conversation.types';

export interface ConversationResponseDto {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Deliberately drops organization_id and user_id from the public API surface.
export function toConversationResponseDto(row: ConversationRow): ConversationResponseDto {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
