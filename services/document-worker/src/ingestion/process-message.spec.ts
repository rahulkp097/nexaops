jest.mock('../db', () => ({
  pool: {},
  withTransaction: jest.fn(),
}));
jest.mock('../extractors');
jest.mock('../documents/storage');
jest.mock('../documents/repository');
jest.mock('../chunking/chunker');
jest.mock('../text/normalize');
jest.mock('../model/tokenizer');
jest.mock('../model/embeddings');

import { withTransaction } from '../db';
import { extractText } from '../extractors';
import { readDocumentFile } from '../documents/storage';
import { findDocumentById, markDocumentStatus, replaceDocumentChunks } from '../documents/repository';
import { chunkPage } from '../chunking/chunker';
import { normalizeText } from '../text/normalize';
import { countTokens, getTokenizer } from '../model/tokenizer';
import { embedTexts } from '../model/embeddings';
import { processIngestionMessage } from './process-message';
import { DocumentNotFoundError, TenantMismatchError, UnrecoverableIngestionError } from './errors';

const mockWithTransaction = withTransaction as jest.Mock;
const mockExtractText = extractText as jest.Mock;
const mockReadDocumentFile = readDocumentFile as jest.Mock;
const mockFindDocumentById = findDocumentById as jest.Mock;
const mockReplaceDocumentChunks = replaceDocumentChunks as jest.Mock;
const mockChunkPage = chunkPage as jest.Mock;
const mockNormalizeText = normalizeText as jest.Mock;
const mockGetTokenizer = getTokenizer as jest.Mock;
const mockCountTokens = countTokens as jest.Mock;
const mockEmbedTexts = embedTexts as jest.Mock;

const fakeClient = { query: jest.fn() };
const document = {
  id: 'doc-1',
  organization_id: 'org-1',
  filename: 'a.txt',
  storage_key: 'org-1/doc-1.txt',
  mime_type: 'text/plain',
  size: 10,
  version: 1,
  status: 'PROCESSING' as const,
  checksum: 'sum',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('processIngestionMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithTransaction.mockImplementation((fn: (client: unknown) => unknown) => fn(fakeClient));
    mockFindDocumentById.mockResolvedValue(document);
    mockReadDocumentFile.mockResolvedValue(Buffer.from('hello'));
    mockExtractText.mockResolvedValue([{ pageNumber: null, text: 'hello world' }]);
    mockNormalizeText.mockImplementation((t: string) => t);
    mockGetTokenizer.mockResolvedValue({});
    mockCountTokens.mockReturnValue(1);
    mockChunkPage.mockReturnValue([{ content: 'hello world', pageNumber: null, tokenCount: 2 }]);
    mockEmbedTexts.mockResolvedValue([[0.1, 0.2]]);
  });

  it('throws DocumentNotFoundError without touching the filesystem when the document is missing', async () => {
    mockFindDocumentById.mockResolvedValue(null);

    await expect(
      processIngestionMessage({ documentId: 'doc-1', organizationId: 'org-1', jobId: 'job-1' }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);

    expect(mockReadDocumentFile).not.toHaveBeenCalled();
  });

  it('throws TenantMismatchError when the message org does not match the document org', async () => {
    await expect(
      processIngestionMessage({ documentId: 'doc-1', organizationId: 'org-B', jobId: 'job-1' }),
    ).rejects.toBeInstanceOf(TenantMismatchError);

    expect(mockReadDocumentFile).not.toHaveBeenCalled();
  });

  it('throws UnrecoverableIngestionError when extraction produces no chunks', async () => {
    mockChunkPage.mockReturnValue([]);

    await expect(
      processIngestionMessage({ documentId: 'doc-1', organizationId: 'org-1', jobId: 'job-1' }),
    ).rejects.toBeInstanceOf(UnrecoverableIngestionError);
  });

  it('happy path: extract -> chunk -> embed -> transaction, in that order with correct arguments', async () => {
    await processIngestionMessage({ documentId: 'doc-1', organizationId: 'org-1', jobId: 'job-1' });

    expect(mockReadDocumentFile).toHaveBeenCalledWith('org-1/doc-1.txt');
    expect(mockExtractText).toHaveBeenCalledWith('text/plain', expect.any(Buffer));
    expect(mockChunkPage).toHaveBeenCalledWith('hello world', null, expect.any(Function));
    expect(mockEmbedTexts).toHaveBeenCalledWith(['hello world']);
    expect(mockReplaceDocumentChunks).toHaveBeenCalledWith(
      fakeClient,
      'doc-1',
      'org-1',
      expect.arrayContaining([
        expect.objectContaining({ content: 'hello world', pageNumber: null, embedding: [0.1, 0.2] }),
      ]),
    );
    expect(markDocumentStatus).toHaveBeenCalledWith(fakeClient, 'doc-1', 'org-1', 'READY');
  });
});
