import { Body, Controller, Get, MessageEvent, Param, ParseUUIDPipe, Post, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/types/request-user.type';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { MessageResponseDto } from './dto/message-response.dto';

// No @Roles(): every role gets chat/knowledge access (spec §11), unlike
// documents (ADMIN-only ingestion). JwtAuthGuard/RolesGuard still apply
// globally, so every route here still requires a valid access token.
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  create(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.create(dto.title, user);
  }

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<ConversationResponseDto[]> {
    return this.conversationsService.list(user);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.getOne(id, user.organizationId);
  }

  @Get(':id/messages')
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<MessageResponseDto[]> {
    return this.conversationsService.listMessages(id, user.organizationId);
  }

  @Post(':id/messages')
  postMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MessageResponseDto> {
    return this.conversationsService.postMessage(id, dto.content, user);
  }

  @Sse(':id/stream')
  stream(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<Observable<MessageEvent>> {
    return this.conversationsService.stream(id, user.organizationId);
  }
}
