import { Role, UserRow, UserStatus } from '../../users/user.types';

export interface AdminUserResponseDto {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Deliberately drops password_hash and organization_id from the public API surface.
export function toAdminUserResponseDto(row: UserRow): AdminUserResponseDto {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
