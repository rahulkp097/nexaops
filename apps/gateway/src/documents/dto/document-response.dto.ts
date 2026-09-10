import { DocumentResponseDto } from '@nexaops/shared-types';
import { DocumentRow } from '../document.types';

// Canonical shape lives in @nexaops/shared-types (the public API contract).
export type { DocumentResponseDto } from '@nexaops/shared-types';

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
