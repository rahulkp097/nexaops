export interface Chunk {
  content: string;
  pageNumber: number | null;
  tokenCount: number;
}

const TARGET_TOKENS = Number(process.env.CHUNK_TARGET_TOKENS ?? '230');
const OVERLAP_TOKENS = Number(process.env.CHUNK_OVERLAP_TOKENS ?? '40');

// Word-boundary chunking (not a tokenizer encode/decode round-trip): this
// model's tokenizer lowercases and lossily reformats text on decode(),
// which would corrupt the stored `content` shown to users as citations.
// countTokens is injected so this module has zero dependency on the real
// embedding model and is trivially unit-testable.
export function chunkPage(
  text: string,
  pageNumber: number | null,
  countTokens: (text: string) => number,
): Chunk[] {
  const words = text.match(/\S+/g) ?? [];
  if (words.length === 0) {
    return [];
  }
  const counts = words.map(countTokens);

  const chunks: Chunk[] = [];
  let start = 0;
  while (start < words.length) {
    let end = start;
    let sum = 0;
    while (end < words.length && sum + counts[end] <= TARGET_TOKENS) {
      sum += counts[end];
      end++;
    }
    if (end === start) {
      // A single "word" alone exceeds the target (e.g. a long URL) —
      // include it anyway rather than looping forever.
      sum += counts[end];
      end++;
    }

    chunks.push({ content: words.slice(start, end).join(' '), pageNumber, tokenCount: sum });
    if (end >= words.length) {
      break;
    }

    let overlapStart = end;
    let overlapTokens = 0;
    while (overlapStart > start && overlapTokens < OVERLAP_TOKENS) {
      overlapStart--;
      overlapTokens += counts[overlapStart];
    }
    start = overlapStart > start ? overlapStart : end;
  }
  return chunks;
}
