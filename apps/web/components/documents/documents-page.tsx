'use client';

import type { DocumentResponseDto } from '@nexaops/shared-types';
import { useEffect, useRef, useState } from 'react';
import {
  listDocuments,
  reindexDocument,
  removeDocument,
  uploadDocument,
  waitForDocumentReady,
} from '../../lib/api/documents';
import { ApiError } from '../../lib/api-client';
import { Badge, Button, ErrorBanner, Spinner } from '../ui';

function statusTone(status: DocumentResponseDto['status']): 'green' | 'red' | 'amber' {
  if (status === 'READY') return 'green';
  if (status === 'FAILED') return 'red';
  return 'amber';
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentResponseDto[] | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    listDocuments()
      .then(setDocuments)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load documents'));
  }

  useEffect(refresh, []);

  function updateDocument(doc: DocumentResponseDto) {
    setDocuments((prev) => {
      if (!prev) return prev;
      const exists = prev.some((d) => d.id === doc.id);
      return exists ? prev.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...prev];
    });
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    setUploadProgress({ name: file.name, percent: 0 });

    const { promise } = uploadDocument(file, (percent) => setUploadProgress({ name: file.name, percent }));
    try {
      const created = await promise;
      updateDocument(created);
      setUploadProgress(null);
      await waitForDocumentReady(created.id, updateDocument);
    } catch (err) {
      setUploadProgress(null);
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    }
  }

  async function handleReindex(id: string) {
    setBusyId(id);
    try {
      const updated = await reindexDocument(id);
      updateDocument(updated);
      await waitForDocumentReady(id, updateDocument);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reindex failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await removeDocument(id);
      setDocuments((prev) => prev?.filter((d) => d.id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Documents</h1>
        <div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploadProgress !== null}>
            Upload document
          </Button>
        </div>
      </div>

      {uploadProgress && (
        <div className="mb-4 rounded-md border border-neutral-200 p-3">
          <p className="mb-1 text-sm">Uploading {uploadProgress.name}…</p>
          <div className="h-2 w-full rounded-full bg-neutral-100">
            <div
              className="h-2 rounded-full bg-neutral-900 transition-all"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {documents === null && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}

      {documents && documents.length === 0 && !uploadProgress && (
        <p className="p-8 text-center text-sm text-neutral-400">No documents uploaded yet.</p>
      )}

      {documents && documents.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-neutral-500">
            <tr>
              <th className="pb-2">Filename</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Size</th>
              <th className="pb-2">Version</th>
              <th className="pb-2">Updated</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="border-t border-neutral-100">
                <td className="py-2">{doc.filename}</td>
                <td className="py-2">
                  <Badge tone={statusTone(doc.status)}>
                    {doc.status === 'PROCESSING' && <Spinner className="mr-1 h-3 w-3 border-amber-300 border-t-amber-800" />}
                    {doc.status}
                  </Badge>
                </td>
                <td className="py-2">{formatBytes(doc.size)}</td>
                <td className="py-2">{doc.version}</td>
                <td className="py-2 text-neutral-500">{new Date(doc.updatedAt).toLocaleString()}</td>
                <td className="space-x-2 py-2 text-right">
                  <Button
                    variant="secondary"
                    disabled={busyId === doc.id}
                    onClick={() => handleReindex(doc.id)}
                  >
                    Reindex
                  </Button>
                  <Button variant="danger" disabled={busyId === doc.id} onClick={() => handleDelete(doc.id)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
