import { extractTxt } from './txt.extractor';

describe('extractTxt', () => {
  it('returns a single page with pageNumber null and the decoded text', async () => {
    const result = await extractTxt(Buffer.from('hello world', 'utf-8'));

    expect(result).toEqual([{ pageNumber: null, text: 'hello world' }]);
  });
});
