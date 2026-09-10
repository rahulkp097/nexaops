// Canonical definition lives in @nexaops/shared-types (the public API
// contract) — re-exported here so internal gateway code keeps importing
// from this file without drifting from that contract.
export type { Role, UserStatus } from '@nexaops/shared-types';
import type { Role, UserStatus } from '@nexaops/shared-types';

export interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  organizationId: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export interface UpdateUserInput {
  role?: Role;
  status?: UserStatus;
}
