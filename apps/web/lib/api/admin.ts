import type { AdminUserResponseDto, AuditLogResponseDto, UpdateUserRequest } from '@nexaops/shared-types';
import { apiFetch } from '../api-client';

export function listUsers(): Promise<AdminUserResponseDto[]> {
  return apiFetch('/admin/users');
}

export function updateUser(id: string, payload: UpdateUserRequest): Promise<AdminUserResponseDto> {
  return apiFetch(`/admin/users/${id}`, { method: 'PATCH', body: payload });
}

export function listAuditLogs(limit = 100): Promise<AuditLogResponseDto[]> {
  return apiFetch('/admin/audit-logs', { query: { limit } });
}
