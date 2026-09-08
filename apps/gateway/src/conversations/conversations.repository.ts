import { Inject, Injectable } from '@nestjs/common';
import { PG_POOL } from '../database/pg-pool.provider';
import { Queryable } from '../database/transaction.util';
import {
  ConversationRow,
  CreateConversationInput,
  CreateMessageInput,
  CreateMessageSourceInput,
  MessageRow,
  MessageSourceRow,
} from './conversation.types';

@Injectable()
export class ConversationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Queryable) {}

  async createConversation(
    input: CreateConversationInput,
    queryable: Queryable = this.pool,
  ): Promise<ConversationRow> {
    const result = await queryable.query<ConversationRow>(
      `INSERT INTO conversations (id, organization_id, user_id, title)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.id, input.organizationId, input.userId, input.title],
    );
    return result.rows[0];
  }

  // Tenant-isolation pattern every repository copies: never fetch an
  // org-owned row by id alone — organizationId is always a required filter.
  async findByIdAndOrganization(
    id: string,
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<ConversationRow | null> {
    const result = await queryable.query<ConversationRow>(
      'SELECT * FROM conversations WHERE id = $1 AND organization_id = $2',
      [id, organizationId],
    );
    return result.rows[0] ?? null;
  }

  // Scoped to the owning user, not just the organization: conversations are
  // personal, not shared across an org's users (spec §25's "Conversation
  // history" is per-user chat history, not a team inbox).
  async listByOrganizationAndUser(
    organizationId: string,
    userId: string,
    queryable: Queryable = this.pool,
  ): Promise<ConversationRow[]> {
    const result = await queryable.query<ConversationRow>(
      `SELECT * FROM conversations
       WHERE organization_id = $1 AND user_id = $2
       ORDER BY updated_at DESC`,
      [organizationId, userId],
    );
    return result.rows;
  }

  async touchUpdatedAt(id: string, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [id]);
  }

  async createMessage(input: CreateMessageInput, queryable: Queryable = this.pool): Promise<MessageRow> {
    const result = await queryable.query<MessageRow>(
      `INSERT INTO messages (id, conversation_id, role, content, model, provider)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.id,
        input.conversationId,
        input.role,
        input.content,
        input.model ?? null,
        input.provider ?? null,
      ],
    );
    return result.rows[0];
  }

  async listByConversation(conversationId: string, queryable: Queryable = this.pool): Promise<MessageRow[]> {
    const result = await queryable.query<MessageRow>(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );
    return result.rows;
  }

  // Oldest-first within the most recent `limit` messages — used to build
  // multi-turn history for the LLM call, not for the full-history endpoint.
  async listRecentByConversation(
    conversationId: string,
    limit: number,
    queryable: Queryable = this.pool,
  ): Promise<MessageRow[]> {
    const result = await queryable.query<MessageRow>(
      `SELECT * FROM (
         SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2
       ) recent
       ORDER BY created_at ASC`,
      [conversationId, limit],
    );
    return result.rows;
  }

  async createMessageSources(
    inputs: CreateMessageSourceInput[],
    queryable: Queryable = this.pool,
  ): Promise<MessageSourceRow[]> {
    const rows: MessageSourceRow[] = [];
    for (const input of inputs) {
      const result = await queryable.query<MessageSourceRow>(
        `INSERT INTO message_sources (id, message_id, document_id, chunk_id, filename, page_number, score)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [input.id, input.messageId, input.documentId, input.chunkId, input.filename, input.pageNumber, input.score],
      );
      rows.push(result.rows[0]);
    }
    return rows;
  }

  async listSourcesByMessageIds(
    messageIds: string[],
    queryable: Queryable = this.pool,
  ): Promise<MessageSourceRow[]> {
    if (messageIds.length === 0) {
      return [];
    }
    const result = await queryable.query<MessageSourceRow>(
      'SELECT * FROM message_sources WHERE message_id = ANY($1)',
      [messageIds],
    );
    return result.rows;
  }
}
