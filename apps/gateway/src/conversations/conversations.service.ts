import { randomUUID } from 'crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { Observable, ReplaySubject } from 'rxjs';
import { RequestUser } from '../auth/types/request-user.type';
import { PG_POOL } from '../database/pg-pool.provider';
import { withTransaction } from '../database/transaction.util';
import { AiServiceRagClient, RagHistoryMessage, RagSourceEventData } from './ai-service/ai-service-rag.client';
import { ChatStreamRegistry } from './chat-stream.registry';
import { CONVERSATION_HISTORY_LIMIT } from './conversations.constants';
import { ConversationsRepository } from './conversations.repository';
import { ConversationRow, MessageRow } from './conversation.types';
import { ConversationResponseDto, toConversationResponseDto } from './dto/conversation-response.dto';
import { MessageResponseDto, toMessageResponseDto } from './dto/message-response.dto';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly conversationsRepository: ConversationsRepository,
    private readonly aiServiceRagClient: AiServiceRagClient,
    private readonly chatStreamRegistry: ChatStreamRegistry,
  ) {}

  async create(title: string | undefined, user: RequestUser): Promise<ConversationResponseDto> {
    const row = await this.conversationsRepository.createConversation({
      id: randomUUID(),
      organizationId: user.organizationId,
      userId: user.userId,
      title: title ?? null,
    });
    return toConversationResponseDto(row);
  }

  async list(user: RequestUser): Promise<ConversationResponseDto[]> {
    const rows = await this.conversationsRepository.listByOrganizationAndUser(
      user.organizationId,
      user.userId,
    );
    return rows.map(toConversationResponseDto);
  }

  async listMessages(conversationId: string, organizationId: string): Promise<MessageResponseDto[]> {
    await this.requireConversation(conversationId, organizationId);
    const rows = await this.conversationsRepository.listByConversation(conversationId);
    const sources = await this.conversationsRepository.listSourcesByMessageIds(rows.map((row) => row.id));
    const sourcesByMessageId = new Map<string, typeof sources>();
    for (const source of sources) {
      const existing = sourcesByMessageId.get(source.message_id) ?? [];
      existing.push(source);
      sourcesByMessageId.set(source.message_id, existing);
    }
    return rows.map((row) => toMessageResponseDto(row, sourcesByMessageId.get(row.id) ?? []));
  }

  // Persists the user message and returns immediately (spec §17: "Create
  // message endpoint. Persist user messages."). Generating and persisting
  // the assistant reply happens in the background (runAssistantResponse)
  // and is delivered over GET /conversations/:id/stream — decoupled from
  // this request's lifetime, so the answer is generated exactly once even
  // if no client ever opens the stream.
  async postMessage(conversationId: string, content: string, user: RequestUser): Promise<MessageResponseDto> {
    const conversation = await this.requireConversation(conversationId, user.organizationId);

    const subject = this.chatStreamRegistry.start(conversationId);
    if (!subject) {
      throw new ConflictException('A response is already being generated for this conversation');
    }

    let history: MessageRow[];
    let userMessage: MessageRow;
    try {
      // Fetched before inserting the new message, so it naturally excludes it.
      history = await this.conversationsRepository.listRecentByConversation(
        conversationId,
        CONVERSATION_HISTORY_LIMIT,
      );
      userMessage = await withTransaction(this.pool, async (client) => {
        const message = await this.conversationsRepository.createMessage(
          { id: randomUUID(), conversationId, role: 'USER', content },
          client,
        );
        await this.conversationsRepository.touchUpdatedAt(conversationId, client);
        return message;
      });
    } catch (error) {
      this.chatStreamRegistry.abort(conversationId, subject);
      throw error;
    }

    const assistantMessageId = randomUUID();
    this.runAssistantResponse(conversation, subject, assistantMessageId, content, history).catch((error) => {
      this.logger.error(
        `Unhandled error generating an assistant response for conversation ${conversationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    });

    return toMessageResponseDto(userMessage);
  }

  async stream(conversationId: string, organizationId: string): Promise<Observable<MessageEvent>> {
    await this.requireConversation(conversationId, organizationId);
    const stream = this.chatStreamRegistry.get(conversationId);
    if (!stream) {
      throw new NotFoundException('No response is being generated for this conversation');
    }
    return stream;
  }

  private async requireConversation(id: string, organizationId: string): Promise<ConversationRow> {
    const conversation = await this.conversationsRepository.findByIdAndOrganization(id, organizationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private async runAssistantResponse(
    conversation: ConversationRow,
    subject: ReplaySubject<MessageEvent>,
    assistantMessageId: string,
    question: string,
    history: MessageRow[],
  ): Promise<void> {
    this.chatStreamRegistry.emit(subject, 'message_start', {
      conversationId: conversation.id,
      messageId: assistantMessageId,
    });

    const ragHistory: RagHistoryMessage[] = history.map((row) => ({
      role: row.role === 'USER' ? 'user' : 'assistant',
      content: row.content,
    }));

    const sources: RagSourceEventData[] = [];
    let answer: string | null = null;
    let model: string | null = null;
    let provider: string | null = null;

    try {
      for await (const event of this.aiServiceRagClient.streamQuery({
        question,
        organizationId: conversation.organization_id,
        history: ragHistory,
      })) {
        if (event.event === 'source') {
          sources.push(event.data);
          this.chatStreamRegistry.emit(subject, 'source', event.data);
        } else if (event.event === 'token') {
          this.chatStreamRegistry.emit(subject, 'token', event.data);
        } else if (event.event === 'done') {
          answer = event.data.answer;
          model = event.data.model;
          provider = event.data.provider;
        } else if (event.event === 'error') {
          this.chatStreamRegistry.emit(subject, 'error', event.data);
          // abort, not complete: an error should free the conversation for
          // an immediate retry rather than holding the 409 lock for the
          // full replay-retention window.
          this.chatStreamRegistry.abort(conversation.id, subject);
          return;
        }
      }
    } catch (error) {
      this.logger.error(
        `AI service call failed for conversation ${conversation.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      this.chatStreamRegistry.emit(subject, 'error', {
        message: 'Failed to reach the AI service',
        retryable: true,
      });
      this.chatStreamRegistry.abort(conversation.id, subject);
      return;
    }

    if (answer === null) {
      // The stream ended without a `done` event — treat as a failure
      // rather than persisting a message with no content.
      this.chatStreamRegistry.emit(subject, 'error', {
        message: 'The AI service closed the connection before completing an answer',
        retryable: true,
      });
      this.chatStreamRegistry.abort(conversation.id, subject);
      return;
    }

    const assistantMessage = await withTransaction(this.pool, async (client) => {
      const message = await this.conversationsRepository.createMessage(
        {
          id: assistantMessageId,
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: answer as string,
          model,
          provider,
        },
        client,
      );
      if (sources.length > 0) {
        await this.conversationsRepository.createMessageSources(
          sources.map((source) => ({
            id: randomUUID(),
            messageId: message.id,
            documentId: source.documentId,
            chunkId: source.chunkId,
            filename: source.filename,
            pageNumber: source.page,
            score: source.score,
          })),
          client,
        );
      }
      await this.conversationsRepository.touchUpdatedAt(conversation.id, client);
      return message;
    });

    const sourceRows = await this.conversationsRepository.listSourcesByMessageIds([assistantMessage.id]);
    this.chatStreamRegistry.emit(
      subject,
      'message_complete',
      toMessageResponseDto(assistantMessage, sourceRows),
    );
    this.chatStreamRegistry.complete(conversation.id, subject);
  }
}
