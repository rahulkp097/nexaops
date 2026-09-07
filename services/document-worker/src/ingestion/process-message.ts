import { pool, withTransaction } from '../db';
import { extractText } from '../extractors';
import { readDocumentFile } from '../documents/storage';
import { findDocumentById, markDocumentStatus, replaceDocumentChunks } from '../documents/repository';
import { chunkPage } from '../chunking/chunker';
import { normalizeText } from '../text/normalize';
import { countTokens, getTokenizer } from '../model/tokenizer';
import { embedTexts } from '../model/embeddings';
import { DocumentNotFoundError, TenantMismatchError, UnrecoverableIngestionError } from './errors';

export interface IngestionJobPayload {
  documentId: string;
  organizationId: string;
  jobId: string;
}

export async function processIngestionMessage(payload: IngestionJobPayload): Promise<void> {
  const document = await findDocumentById(pool, payload.documentId);
  if (!document) {
    throw new DocumentNotFoundError(payload.documentId);
  }
  if (document.organization_id !== payload.organizationId) {
    throw new TenantMismatchError(`Organization mismatch for document ${document.id}`);
  }

  const buffer = await readDocumentFile(document.storage_key);
  const pages = await extractText(document.mime_type, buffer);

  const tokenizer = await getTokenizer();
  const chunks = pages
    .map((page) => ({ ...page, text: normalizeText(page.text) }))
    .flatMap((page) => chunkPage(page.text, page.pageNumber, (text) => countTokens(tokenizer, text)));

  if (chunks.length === 0) {
    throw new UnrecoverableIngestionError(`Document ${document.id} produced no extractable text`);
  }

  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

  await withTransaction(async (client) => {
    await replaceDocumentChunks(
      client,
      document.id,
      document.organization_id,
      chunks.map((chunk, index) => ({
        content: chunk.content,
        pageNumber: chunk.pageNumber,
        section: null,
        metadata: { tokenCount: chunk.tokenCount },
        embedding: embeddings[index],
      })),
    );
    await markDocumentStatus(client, document.id, document.organization_id, 'READY');
  });
}
