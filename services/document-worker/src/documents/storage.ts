import * as path from 'path';
import * as fs from 'fs/promises';

// Local mirror of apps/gateway/src/documents/storage/local-storage.service.ts's
// path-safety check — not importable across workspaces.
const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_PATH ?? './storage');

export async function readDocumentFile(storageKey: string): Promise<Buffer> {
  const fullPath = path.resolve(STORAGE_ROOT, storageKey);
  const rootWithSep = STORAGE_ROOT.endsWith(path.sep) ? STORAGE_ROOT : STORAGE_ROOT + path.sep;
  if (fullPath !== STORAGE_ROOT && !fullPath.startsWith(rootWithSep)) {
    throw new Error(`Storage key resolves outside the storage root: ${storageKey}`);
  }
  return fs.readFile(fullPath);
}
