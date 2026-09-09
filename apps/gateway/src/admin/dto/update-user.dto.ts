import { IsIn, IsOptional } from 'class-validator';
import { Role, UserStatus } from '../../users/user.types';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
const STATUSES: UserStatus[] = ['ACTIVE', 'DISABLED'];

export class UpdateUserDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsIn(STATUSES)
  status?: UserStatus;
}
