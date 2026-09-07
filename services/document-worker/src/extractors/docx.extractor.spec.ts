const mockExtractRawText = jest.fn();

jest.mock('mammoth', () => ({
  extractRawText: (...args: unknown[]) => mockExtractRawText(...args),
}));

import { extractDocx } from './docx.extractor';
import { UnrecoverableIngestionError } from '../ingestion/errors';

describe('extractDocx', () => {
  beforeEach(() => {
    mockExtractRawText.mockReset();
  });

  it('returns a single page with pageNumber null (DOCX has no native pages)', async () => {
    mockExtractRawText.mockResolvedValue({ value: 'the document text', messages: [] });

    const result = await extractDocx(Buffer.from('fake-docx'));

    expect(result).toEqual([{ pageNumber: null, text: 'the document text' }]);
  });

  it('wraps a parse failure in UnrecoverableIngestionError', async () => {
    mockExtractRawText.mockRejectedValue(new Error('corrupt docx'));

    await expect(extractDocx(Buffer.from('bad'))).rejects.toBeInstanceOf(UnrecoverableIngestionError);
  });
});
