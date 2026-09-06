export type AuditAction =
  | 'user.registered'
  | 'user.login_succeeded'
  | 'user.login_failed'
  | 'user.logout'
  | 'user.token_refreshed'
  | 'security.refresh_token_reused';

export interface RecordAuditEventInput {
  organizationId?: string | null;
  userId?: string | null;
  action: AuditAction;
  resource: string;
  metadata?: Record<string, unknown>;
}
