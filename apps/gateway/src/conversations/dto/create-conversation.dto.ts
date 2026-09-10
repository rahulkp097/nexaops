import { CreateConversationRequest } from '@nexaops/shared-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// `implements` catches drift from @nexaops/shared-types' canonical request
// shape at compile time — the class-validator decorators stay gateway-local
// since validation is a server-only concern.
export class CreateConversationDto implements CreateConversationRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}
