import type { DocumentResponseDto } from '@nexaops/shared-types';
import { API_BASE_URL, ApiError, apiFetch } from '../api-client';
import { getAccessToken } from '../token-storage';

export function listDocuments(): Promise<DocumentResponseDto[]> {
  return apiFetch('/documents');
}

export function getDocument(id: string): Promise<DocumentResponseDto> {
  return apiFetch(`/documents/${id}`);
}

export function removeDocument(id: string): Promise<void> {
  return apiFetch(`/documents/${id}`, { method: 'DELETE' });
}

export function reindexDocument(id: string): Promise<DocumentResponseDto> {
  return apiFetch(`/documents/${id}/reindex`, { method: 'POST' });
}

// XMLHttpRequest, not fetch: it's the only browser API that reports real
// upload byte progress (fetch's request-body streaming/progress support is
// still inconsistent across browsers). Doesn't go through apiFetch's
// refresh-on-401 dance — an upload is a single multi-second request, not
// worth the complexity of retrying mid-upload; a stale token just surfaces
// as a clear error the user can retry (any other apiFetch call on the page
// will have refreshed it by then).
export function uploadDocument(
  file: File,
  onProgress?: (percent: number) => void,
): { promise: Promise<DocumentResponseDto>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<DocumentResponseDto>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);

    xhr.open('POST', `${API_BASE_URL}/documents`);
    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as DocumentResponseDto);
        return;
      }
      let message = `Upload failed with status ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string | string[] };
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? message;
      } catch {
        // no JSON body — keep the generic message
      }
      reject(new ApiError(xhr.status, message));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error while uploading'));
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled'));

    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}

// Polls until the document leaves PROCESSING — mirrors
// scripts/e2e-smoke-test.mjs's own wait loop, the same real behavior this
// project already relies on elsewhere.
export async function waitForDocumentReady(
  id: string,
  onUpdate?: (doc: DocumentResponseDto) => void,
  { intervalMs = 1000, timeoutMs = 60_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<DocumentResponseDto> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const doc = await getDocument(id);
    onUpdate?.(doc);
    if (doc.status !== 'PROCESSING') {
      return doc;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${doc.filename} to leave PROCESSING`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
