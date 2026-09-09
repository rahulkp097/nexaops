export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type UserStatus = 'ACTIVE' | 'DISABLED';

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
