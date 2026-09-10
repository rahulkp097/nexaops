import { UpdateUserRequest } from '@nexaops/shared-types';
import { IsIn, IsOptional } from 'class-validator';
import { Role, UserStatus } from '../../users/user.types';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
const STATUSES: UserStatus[] = ['ACTIVE', 'DISABLED'];

export class UpdateUserDto implements UpdateUserRequest {
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsIn(STATUSES)
  status?: UserStatus;
}
