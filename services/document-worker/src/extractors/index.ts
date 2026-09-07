import { extractDocx } from './docx.extractor';
import { extractPdf } from './pdf.extractor';
import { extractTxt } from './txt.extractor';
import { ExtractedPage } from './types';
import { UnrecoverableIngestionError } from '../ingestion/errors';

export type { ExtractedPage };

// Must stay in lockstep with apps/gateway/src/documents/documents.constants.ts's
// ALLOWED_MIME_TYPES — not importable across workspaces (see that file's
// own comment on the same constraint).
export async function extractText(mimeType: string, buffer: Buffer): Promise<ExtractedPage[]> {
  switch (mimeType) {
    case 'application/pdf':
      return extractPdf(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractDocx(buffer);
    case 'text/plain':
      return extractTxt(buffer);
    default:
      throw new UnrecoverableIngestionError(`Unsupported mime type: ${mimeType}`);
  }
}
