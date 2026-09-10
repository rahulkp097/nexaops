import { ConflictException, MessageEvent, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { firstValueFrom, ReplaySubject } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { AiServiceMemoryClient } from './ai-service/ai-service-memory.client';
import { AiServiceRagClient } from './ai-service/ai-service-rag.client';
import { ChatStreamRegistry } from './chat-stream.registry';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

function makePool() {
  const clientQuery = jest.fn().mockResolvedValue(undefined);
  const release = jest.fn();
  const client = { query: clientQuery, release };
  const connect = jest.fn().mockResolvedValue(client);
  return { pool: { connect } as unknown as Pool, client };
}

describe('ConversationsService', () => {
  const user = { userId: 'user-1', organizationId: 'org-1', role: 'EMPLOYEE' as const };

  const conversationRow = {
    id: 'conv-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    title: 'Refund questions',
    summary: null,
    summarized_message_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  let conversationsRepository: jest.Mocked<
    Pick<
      ConversationsRepository,
      | 'createConversation'
      | 'findByIdAndOrganization'
      | 'listByOrganizationAndUser'
      | 'listByConversation'
      | 'listRecentByConversation'
      | 'countMessagesByConversation'
      | 'listMessageRange'
      | 'updateSummary'
      | 'createMessage'
      | 'createMessageSources'
      | 'listSourcesByMessageIds'
      | 'touchUpdatedAt'
    >
  >;
  let aiServiceRagClient: jest.Mocked<Pick<AiServiceRagClient, 'streamQuery'>>;
  let aiServiceMemoryClient: jest.Mocked<Pick<AiServiceMemoryClient, 'summarize'>>;
  let chatStreamRegistry: ChatStreamRegistry;
  let pool: ReturnType<typeof makePool>;
  let service: ConversationsService;
  // ChatStreamRegistry.complete/abort can delete a conversation's session
  // (and any reference chatStreamRegistry.get() would return) before the
  // test gets a chance to read it back — runAssistantResponse is
  // fire-and-forget, so that cleanup can race the test's own `await`.
  // Capturing the subject at the moment it's created sidesteps the race:
  // the Subject instance itself stays valid (and still replays everything)
  // regardless of whether the registry's map still references it.
  let capturedSubject: ReplaySubject<MessageEvent> | null;

  beforeEach(() => {
    conversationsRepository = {
      createConversation: jest.fn(),
      findByIdAndOrganization: jest.fn(),
      listByOrganizationAndUser: jest.fn(),
      listByConversation: jest.fn(),
      listRecentByConversation: jest.fn(),
      // Defaults to "conversation is short, nothing new to summarize" so
      // existing tests below don't need to know about summarization at all.
      countMessagesByConversation: jest.fn().mockResolvedValue(0),
      listMessageRange: jest.fn(),
      updateSummary: jest.fn(),
      createMessage: jest.fn(),
      createMessageSources: jest.fn(),
      listSourcesByMessageIds: jest.fn(),
      touchUpdatedAt: jest.fn(),
    };
    aiServiceRagClient = { streamQuery: jest.fn() };
    aiServiceMemoryClient = { summarize: jest.fn() };
    chatStreamRegistry = new ChatStreamRegistry();
    capturedSubject = null;
    jest.spyOn(chatStreamRegistry, 'start').mockImplementation((id: string) => {
      const subject = ChatStreamRegistry.prototype.start.call(chatStreamRegistry, id);
      if (subject) {
        capturedSubject = subject;
      }
      return subject;
    });
    pool = makePool();

    service = new ConversationsService(
      pool.pool,
      conversationsRepository as unknown as ConversationsRepository,
      aiServiceRagClient as unknown as AiServiceRagClient,
      aiServiceMemoryClient as unknown as AiServiceMemoryClient,
      chatStreamRegistry,
    );
  });

  describe('create', () => {
    it('creates a conversation scoped to the current user and organization', async () => {
      conversationsRepository.createConversation.mockResolvedValue(conversationRow);

      const result = await service.create('Refund questions', user);

      expect(conversationsRepository.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', userId: 'user-1', title: 'Refund questions' }),
      );
      expect(result.id).toBe('conv-1');
    });
  });

  describe('getOne', () => {
    it('returns the conversation scoped to the caller organization', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);

      const result = await service.getOne('conv-1', 'org-1');

      expect(conversationsRepository.findByIdAndOrganization).toHaveBeenCalledWith('conv-1', 'org-1');
      expect(result).toEqual({
        id: 'conv-1',
        title: 'Refund questions',
        createdAt: conversationRow.created_at,
        updatedAt: conversationRow.updated_at,
      });
    });

    it('throws NotFoundException for a conversation belonging to a different org', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(service.getOne('conv-1', 'org-B')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list / listMessages cross-tenant access', () => {
    it('listMessages throws NotFoundException for a conversation belonging to a different org', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(service.listMessages('conv-1', 'org-B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listMessages groups sources by message id', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      conversationsRepository.listByConversation.mockResolvedValue([
        {
          id: 'msg-1',
          conversation_id: 'conv-1',
          role: 'ASSISTANT',
          content: 'Refunds take 30 days.',
          model: 'claude-sonnet-5',
          provider: 'anthropic',
          created_at: new Date(),
        },
      ]);
      conversationsRepository.listSourcesByMessageIds.mockResolvedValue([
        {
          id: 'src-1',
          message_id: 'msg-1',
          document_id: 'doc-1',
          chunk_id: 'chunk-1',
          filename: 'policy.pdf',
          page_number: 4,
          score: 0.9,
          created_at: new Date(),
        },
      ]);

      const result = await service.listMessages('conv-1', 'org-1');

      expect(result).toHaveLength(1);
      expect(result[0].sources).toEqual([
        { documentId: 'doc-1', chunkId: 'chunk-1', filename: 'policy.pdf', page: 4, score: 0.9 },
      ]);
    });
  });

  describe('postMessage', () => {
    it('throws NotFoundException for a conversation belonging to a different org and starts no stream session', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(service.postMessage('conv-1', 'hi', { ...user, organizationId: 'org-B' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(chatStreamRegistry.get('conv-1')).toBeNull();
    });

    it('persists the user message and returns immediately without waiting for the assistant response', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      conversationsRepository.listRecentByConversation.mockResolvedValue([]);
      conversationsRepository.createMessage.mockResolvedValueOnce({
        id: 'msg-user-1',
        conversation_id: 'conv-1',
        role: 'USER',
        content: 'What is the refund policy?',
        model: null,
        provider: null,
        created_at: new Date(),
      });
      // The assistant pipeline never resolves within this test — proves
      // postMessage doesn't await it.
      aiServiceRagClient.streamQuery.mockImplementation(async function* () {
        await new Promise(() => undefined);
        yield undefined as never;
      });

      const result = await service.postMessage('conv-1', 'What is the refund policy?', user);

      expect(result.id).toBe('msg-user-1');
      expect(result.role).toBe('USER');
      expect(conversationsRepository.touchUpdatedAt).toHaveBeenCalledWith('conv-1', pool.client);
    });

    it('throws ConflictException when a response is already being generated for this conversation', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      chatStreamRegistry.start('conv-1');

      await expect(service.postMessage('conv-1', 'another message', user)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(conversationsRepository.createMessage).not.toHaveBeenCalled();
    });

    it('frees the stream slot immediately if persisting the user message fails', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      conversationsRepository.listRecentByConversation.mockResolvedValue([]);
      conversationsRepository.createMessage.mockRejectedValue(new Error('db down'));

      await expect(service.postMessage('conv-1', 'hi', user)).rejects.toThrow('db down');

      // Freed immediately (abort, not the retained complete()) — a retry
      // isn't blocked by the earlier failure.
      expect(chatStreamRegistry.start('conv-1')).not.toBeNull();
    });

    it('streams message_start, forwards source/token events, then persists and emits message_complete', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      conversationsRepository.listRecentByConversation.mockResolvedValue([
        {
          id: 'msg-0',
          conversation_id: 'conv-1',
          role: 'USER',
          content: 'Hi',
          model: null,
          provider: null,
          created_at: new Date(),
        },
      ]);
      conversationsRepository.createMessage
        .mockResolvedValueOnce({
          id: 'msg-user-1',
          conversation_id: 'conv-1',
          role: 'USER',
          content: 'What is the refund policy?',
          model: null,
          provider: null,
          created_at: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'msg-assistant-1',
          conversation_id: 'conv-1',
          role: 'ASSISTANT',
          content: 'Refunds take 30 days.',
          model: 'claude-sonnet-5',
          provider: 'anthropic',
          created_at: new Date(),
        });
      conversationsRepository.createMessageSources.mockResolvedValue([]);
      conversationsRepository.listSourcesByMessageIds.mockResolvedValue([
        {
          id: 'src-1',
          message_id: 'msg-assistant-1',
          document_id: 'doc-1',
          chunk_id: 'chunk-1',
          filename: 'policy.pdf',
          page_number: 4,
          score: 0.9,
          created_at: new Date(),
        },
      ]);
      aiServiceRagClient.streamQuery.mockImplementation(async function* () {
        yield {
          event: 'source' as const,
          data: { documentId: 'doc-1', chunkId: 'chunk-1', filename: 'policy.pdf', page: 4, score: 0.9 },
        };
        yield { event: 'token' as const, data: { text: 'Refunds ' } };
        yield { event: 'token' as const, data: { text: 'take 30 days.' } };
        yield {
          event: 'done' as const,
          data: { answer: 'Refunds take 30 days.', model: 'claude-sonnet-5', provider: 'anthropic' },
        };
      });

      await service.postMessage('conv-1', 'What is the refund policy?', user);

      // aiServiceRagClient receives the just-fetched history — excluding the
      // message about to be inserted — as lowercase role turns.
      expect(aiServiceRagClient.streamQuery).toHaveBeenCalledWith({
        question: 'What is the refund policy?',
        organizationId: 'org-1',
        history: [{ role: 'user', content: 'Hi' }],
        conversationSummary: null,
      });

      const events = await firstValueFrom(capturedSubject!.pipe(toArray()));
      expect(events.map((e) => e.type)).toEqual(['message_start', 'source', 'token', 'token', 'message_complete']);
      const completeEvent = events[events.length - 1].data as { content: string; sources: unknown[] };
      expect(completeEvent.content).toBe('Refunds take 30 days.');
      expect(completeEvent.sources).toHaveLength(1);

      expect(conversationsRepository.createMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          role: 'ASSISTANT',
          content: 'Refunds take 30 days.',
          model: 'claude-sonnet-5',
          provider: 'anthropic',
        }),
        pool.client,
      );
      expect(conversationsRepository.createMessageSources).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            messageId: 'msg-assistant-1',
            documentId: 'doc-1',
            chunkId: 'chunk-1',
            filename: 'policy.pdf',
            pageNumber: 4,
            score: 0.9,
          }),
        ],
        pool.client,
      );
    });

    it('emits an error event and persists nothing for the assistant turn when ai-service reports an error', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      conversationsRepository.listRecentByConversation.mockResolvedValue([]);
      conversationsRepository.createMessage.mockResolvedValueOnce({
        id: 'msg-user-1',
        conversation_id: 'conv-1',
        role: 'USER',
        content: 'question',
        model: null,
        provider: null,
        created_at: new Date(),
      });
      aiServiceRagClient.streamQuery.mockImplementation(async function* () {
        yield { event: 'error' as const, data: { message: 'AI provider temporarily unavailable', retryable: true } };
      });

      await service.postMessage('conv-1', 'question', user);

      const events = await firstValueFrom(capturedSubject!.pipe(toArray()));
      expect(events.map((e) => e.type)).toEqual(['message_start', 'error']);
      expect(conversationsRepository.createMessage).toHaveBeenCalledTimes(1);
      // abort(), not complete(): the conversation is immediately free again.
      expect(chatStreamRegistry.start('conv-1')).not.toBeNull();
    });

    it('emits an error event when the ai-service call throws', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      conversationsRepository.listRecentByConversation.mockResolvedValue([]);
      conversationsRepository.createMessage.mockResolvedValueOnce({
        id: 'msg-user-1',
        conversation_id: 'conv-1',
        role: 'USER',
        content: 'question',
        model: null,
        provider: null,
        created_at: new Date(),
      });
      aiServiceRagClient.streamQuery.mockImplementation(async function* () {
        throw new Error('network error');
        // eslint-disable-next-line no-unreachable
        yield undefined as never;
      });

      await service.postMessage('conv-1', 'question', user);

      const events = await firstValueFrom(capturedSubject!.pipe(toArray()));
      expect(events.map((e) => e.type)).toEqual(['message_start', 'error']);
      expect(conversationsRepository.createMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('postMessage conversation summary (Phase 16)', () => {
    function stubHappyPath() {
      conversationsRepository.createMessage.mockResolvedValueOnce({
        id: 'msg-user-1',
        conversation_id: 'conv-1',
        role: 'USER',
        content: 'question',
        model: null,
        provider: null,
        created_at: new Date(),
      });
      aiServiceRagClient.streamQuery.mockImplementation(async function* () {
        yield { event: 'done' as const, data: { answer: 'answer', model: 'claude-sonnet-5', provider: 'anthropic' } };
      });
    }

    it('does not summarize while the conversation still fits inside the recent-message window', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      conversationsRepository.listRecentByConversation.mockResolvedValue([]);
      conversationsRepository.countMessagesByConversation.mockResolvedValue(10); // == CONVERSATION_HISTORY_LIMIT
      stubHappyPath();

      await service.postMessage('conv-1', 'question', user);

      expect(conversationsRepository.listMessageRange).not.toHaveBeenCalled();
      expect(aiServiceMemoryClient.summarize).not.toHaveBeenCalled();
      expect(aiServiceRagClient.streamQuery).toHaveBeenCalledWith(
        expect.objectContaining({ conversationSummary: null }),
      );
    });

    it('summarizes only the newly aged-out messages once the conversation grows past the window, and persists the result', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      conversationsRepository.listRecentByConversation.mockResolvedValue([]);
      conversationsRepository.countMessagesByConversation.mockResolvedValue(11); // one past the limit
      conversationsRepository.listMessageRange.mockResolvedValue([
        {
          id: 'msg-old-1',
          conversation_id: 'conv-1',
          role: 'USER',
          content: 'What is our refund window?',
          model: null,
          provider: null,
          created_at: new Date(),
        },
      ]);
      aiServiceMemoryClient.summarize.mockResolvedValue('The user asked about the refund window.');
      stubHappyPath();

      await service.postMessage('conv-1', 'question', user);

      expect(conversationsRepository.listMessageRange).toHaveBeenCalledWith('conv-1', 0, 1);
      expect(aiServiceMemoryClient.summarize).toHaveBeenCalledWith({
        previousSummary: null,
        messages: [{ role: 'user', content: 'What is our refund window?' }],
      });
      expect(conversationsRepository.updateSummary).toHaveBeenCalledWith(
        'conv-1',
        'The user asked about the refund window.',
        1,
      );
      expect(aiServiceRagClient.streamQuery).toHaveBeenCalledWith(
        expect.objectContaining({ conversationSummary: 'The user asked about the refund window.' }),
      );
    });

    it('falls back to the last-known summary and still answers when the AI service summarize call fails', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue({
        ...conversationRow,
        summary: 'Previously: the user asked about order 10291.',
      });
      conversationsRepository.listRecentByConversation.mockResolvedValue([]);
      conversationsRepository.countMessagesByConversation.mockResolvedValue(11);
      conversationsRepository.listMessageRange.mockResolvedValue([
        {
          id: 'msg-old-1',
          conversation_id: 'conv-1',
          role: 'USER',
          content: 'Anything new?',
          model: null,
          provider: null,
          created_at: new Date(),
        },
      ]);
      aiServiceMemoryClient.summarize.mockRejectedValue(new Error('AI service request failed with status 503'));
      stubHappyPath();

      await service.postMessage('conv-1', 'question', user);

      expect(conversationsRepository.updateSummary).not.toHaveBeenCalled();
      expect(aiServiceRagClient.streamQuery).toHaveBeenCalledWith(
        expect.objectContaining({ conversationSummary: 'Previously: the user asked about order 10291.' }),
      );
      // The failed summarization never blocked persisting/answering the message.
      expect(conversationsRepository.createMessage).toHaveBeenCalled();
    });
  });

  describe('stream', () => {
    it('throws NotFoundException for a conversation belonging to a different org', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(service.stream('conv-1', 'org-B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when no response is being generated', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);

      await expect(service.stream('conv-1', 'org-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the active session observable', async () => {
      conversationsRepository.findByIdAndOrganization.mockResolvedValue(conversationRow);
      chatStreamRegistry.start('conv-1');

      const observable = await service.stream('conv-1', 'org-1');

      expect(observable).toBe(chatStreamRegistry.get('conv-1'));
    });
  });
});
