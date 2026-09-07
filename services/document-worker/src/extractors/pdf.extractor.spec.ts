const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

import { extractPdf } from './pdf.extractor';
import { UnrecoverableIngestionError } from '../ingestion/errors';

describe('extractPdf', () => {
  beforeEach(() => {
    mockGetText.mockReset();
    mockDestroy.mockClear();
  });

  it('maps each PDF page to an ExtractedPage with its real page number', async () => {
    mockGetText.mockResolvedValue({
      pages: [
        { num: 1, text: 'first page' },
        { num: 2, text: 'second page' },
      ],
      text: 'first page second page',
      total: 2,
    });

    const result = await extractPdf(Buffer.from('fake-pdf'));

    expect(result).toEqual([
      { pageNumber: 1, text: 'first page' },
      { pageNumber: 2, text: 'second page' },
    ]);
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('wraps a parse failure in UnrecoverableIngestionError and still destroys the parser', async () => {
    mockGetText.mockRejectedValue(new Error('corrupt PDF'));

    await expect(extractPdf(Buffer.from('bad'))).rejects.toBeInstanceOf(UnrecoverableIngestionError);
    expect(mockDestroy).toHaveBeenCalled();
  });
});
