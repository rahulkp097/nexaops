import { Module } from '@nestjs/common';
import { AiServiceAgentClient } from './ai-service/ai-service-agent.client';
import { AiServiceMemoryClient } from './ai-service/ai-service-memory.client';
import { ChatStreamRegistry } from './chat-stream.registry';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

@Module({
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationsRepository,
    AiServiceAgentClient,
    AiServiceMemoryClient,
    ChatStreamRegistry,
  ],
})
export class ConversationsModule {}
