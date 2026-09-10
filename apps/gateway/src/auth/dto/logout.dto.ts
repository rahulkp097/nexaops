import { LogoutRequest } from '@nexaops/shared-types';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto implements LogoutRequest {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
