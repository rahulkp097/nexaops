import { ExtractedPage } from './types';

export async function extractTxt(buffer: Buffer): Promise<ExtractedPage[]> {
  return [{ pageNumber: null, text: buffer.toString('utf-8') }];
}
