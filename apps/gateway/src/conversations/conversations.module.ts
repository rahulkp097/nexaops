import { Module } from '@nestjs/common';
import { AiServiceMemoryClient } from './ai-service/ai-service-memory.client';
import { AiServiceRagClient } from './ai-service/ai-service-rag.client';
import { ChatStreamRegistry } from './chat-stream.registry';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

@Module({
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationsRepository,
    AiServiceRagClient,
    AiServiceMemoryClient,
    ChatStreamRegistry,
  ],
})
export class ConversationsModule {}
