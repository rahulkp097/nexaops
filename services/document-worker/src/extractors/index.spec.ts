jest.mock('./pdf.extractor', () => ({ extractPdf: jest.fn().mockResolvedValue('pdf-result') }));
jest.mock('./docx.extractor', () => ({ extractDocx: jest.fn().mockResolvedValue('docx-result') }));
jest.mock('./txt.extractor', () => ({ extractTxt: jest.fn().mockResolvedValue('txt-result') }));

import { extractText } from './index';
import { extractPdf } from './pdf.extractor';
import { extractDocx } from './docx.extractor';
import { extractTxt } from './txt.extractor';
import { UnrecoverableIngestionError } from '../ingestion/errors';

describe('extractText', () => {
  const buffer = Buffer.from('x');

  it('dispatches application/pdf to extractPdf', async () => {
    await expect(extractText('application/pdf', buffer)).resolves.toBe('pdf-result');
    expect(extractPdf).toHaveBeenCalledWith(buffer);
  });

  it('dispatches the DOCX mime type to extractDocx', async () => {
    await expect(
      extractText(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer,
      ),
    ).resolves.toBe('docx-result');
    expect(extractDocx).toHaveBeenCalledWith(buffer);
  });

  it('dispatches text/plain to extractTxt', async () => {
    await expect(extractText('text/plain', buffer)).resolves.toBe('txt-result');
    expect(extractTxt).toHaveBeenCalledWith(buffer);
  });

  it('throws UnrecoverableIngestionError for an unsupported mime type', async () => {
    await expect(extractText('application/zip', buffer)).rejects.toBeInstanceOf(
      UnrecoverableIngestionError,
    );
  });
});
