import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MESSAGE_CONTENT_MAX_LENGTH } from '../conversations.constants';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MESSAGE_CONTENT_MAX_LENGTH)
  content!: string;
}
