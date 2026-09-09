export type AuditAction =
  | 'user.registered'
  | 'user.login_succeeded'
  | 'user.login_failed'
  | 'user.logout'
  | 'user.token_refreshed'
  | 'security.refresh_token_reused'
  | 'document.uploaded'
  | 'document.deleted'
  | 'document.reindex_requested'
  | 'admin.user_updated';

export interface RecordAuditEventInput {
  organizationId?: string | null;
  userId?: string | null;
  action: AuditAction;
  resource: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRow {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  action: AuditAction;
  resource: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}
