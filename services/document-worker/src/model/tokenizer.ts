import { loadTransformers, TransformersModule } from './runtime';

const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';

type Tokenizer = Awaited<ReturnType<TransformersModule['AutoTokenizer']['from_pretrained']>>;

let tokenizerPromise: Promise<Tokenizer> | null = null;

// Lazy singleton, loaded once and reused for every message this process
// handles — model load is slow, must not happen per-document.
export function getTokenizer(): Promise<Tokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = loadTransformers().then((mod) => mod.AutoTokenizer.from_pretrained(MODEL_ID));
  }
  return tokenizerPromise;
}

// add_special_tokens: false — counting raw content tokens; [CLS]/[SEP] are
// added separately by the embedding pipeline itself, not part of the
// chunk's own token budget.
export function countTokens(tokenizer: Tokenizer, text: string): number {
  return tokenizer.encode(text, null, { add_special_tokens: false }).length;
}
