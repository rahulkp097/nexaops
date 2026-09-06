export type DocumentStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface DocumentRow {
  id: string;
  organization_id: string;
  filename: string;
  storage_key: string;
  mime_type: string;
  size: number;
  version: number;
  status: DocumentStatus;
  checksum: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDocumentInput {
  id: string;
  organizationId: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksum: string;
}
