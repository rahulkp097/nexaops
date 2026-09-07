import * as mammoth from 'mammoth';
import { UnrecoverableIngestionError } from '../ingestion/errors';
import { ExtractedPage } from './types';

// DOCX has no native page concept without full layout rendering.
export async function extractDocx(buffer: Buffer): Promise<ExtractedPage[]> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return [{ pageNumber: null, text: result.value }];
  } catch (error) {
    throw new UnrecoverableIngestionError(`Failed to parse DOCX: ${(error as Error).message}`);
  }
}
