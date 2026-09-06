// Must stay in exact lockstep with Phase 4's PDF/DOCX/TXT extractors — not
// env-configurable, unlike other document settings.
export const ALLOWED_MIME_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
};

// Deliberately takes no filename: the storage key is built entirely from
// server-generated ids plus a fixed extension lookup, so a malicious
// client-supplied filename can never influence a filesystem path.
export function buildStorageKey(organizationId: string, documentId: string, mimeType: string): string {
  const extension = ALLOWED_MIME_TYPES[mimeType];
  if (!extension) {
    throw new Error(`Unsupported mime type for storage key: ${mimeType}`);
  }
  return `${organizationId}/${documentId}${extension}`;
}
