import { chunkPage } from './chunker';

// One token per word, simplest possible countTokens for boundary testing.
const oneTokenPerWord = (text: string) => text.match(/\S+/g)?.length ?? 0;

describe('chunkPage', () => {
  it('returns an empty array for empty/whitespace-only text', () => {
    expect(chunkPage('', 1, oneTokenPerWord)).toEqual([]);
    expect(chunkPage('   \n  ', 1, oneTokenPerWord)).toEqual([]);
  });

  it('produces a single chunk when the text fits within TARGET_TOKENS', () => {
    const text = Array.from({ length: 10 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkPage(text, 3, oneTokenPerWord);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].pageNumber).toBe(3);
    expect(chunks[0].tokenCount).toBe(10);
  });

  it('splits long text into multiple chunks respecting the target size', () => {
    // countTokens counts one "token" per character here, via word length
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`);
    const text = words.join(' ');
    const countChars = (t: string) => t.replace(/\s/g, '').length;

    const chunks = chunkPage(text, null, countChars);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.pageNumber).toBeNull();
    }
  });

  it('overlaps the trailing words of the previous chunk into the next chunk', () => {
    // 300 single-token words, target=230, overlap=40 (module defaults)
    const words = Array.from({ length: 300 }, (_, i) => `tok${i}`);
    const chunks = chunkPage(words.join(' '), 1, oneTokenPerWord);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const firstChunkWords = chunks[0].content.split(' ');
    const secondChunkWords = chunks[1].content.split(' ');
    const overlapCandidate = firstChunkWords[firstChunkWords.length - 1];
    expect(secondChunkWords).toContain(overlapCandidate);
  });

  it('does not infinite-loop on a single pathologically long "word"', () => {
    const hugeWord = 'x'.repeat(10000);
    const text = `${hugeWord} short words after`;

    const chunks = chunkPage(text, null, (t) => t.length);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content).toContain(hugeWord);
  });
});
