import { DocumentRow, DocumentStatus } from '../document.types';

export interface DocumentResponseDto {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  version: number;
  status: DocumentStatus;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
}

// Deliberately drops storage_key and organization_id from the public API surface.
export function toDocumentResponseDto(row: DocumentRow): DocumentResponseDto {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size,
    version: row.version,
    status: row.status,
    checksum: row.checksum,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
