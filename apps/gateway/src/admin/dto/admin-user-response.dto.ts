import { AdminUserResponseDto } from '@nexaops/shared-types';
import { UserRow } from '../../users/user.types';

// Canonical shape lives in @nexaops/shared-types (the public API contract).
export type { AdminUserResponseDto } from '@nexaops/shared-types';

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
