import { Role, UserStatus } from './common';

export interface AdminUserResponseDto {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserRequest {
  role?: Role;
  status?: UserStatus;
}

export interface AuditLogResponseDto {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
