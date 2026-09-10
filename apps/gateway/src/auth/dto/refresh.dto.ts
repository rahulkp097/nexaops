import { RefreshRequest } from '@nexaops/shared-types';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto implements RefreshRequest {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
