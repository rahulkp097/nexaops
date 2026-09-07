import { PDFParse } from 'pdf-parse';
import { UnrecoverableIngestionError } from '../ingestion/errors';
import { ExtractedPage } from './types';

export async function extractPdf(buffer: Buffer): Promise<ExtractedPage[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({ pageNumber: page.num, text: page.text }));
  } catch (error) {
    throw new UnrecoverableIngestionError(`Failed to parse PDF: ${(error as Error).message}`);
  } finally {
    await parser.destroy();
  }
}
