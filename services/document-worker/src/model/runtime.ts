import { importEsm } from './esm-import';

export type TransformersModule = typeof import('@xenova/transformers');

let modulePromise: Promise<TransformersModule> | null = null;

// Loaded once and reused by both the tokenizer and the embedding pipeline
// so cache-dir configuration happens exactly once.
export function loadTransformers(): Promise<TransformersModule> {
  if (!modulePromise) {
    modulePromise = importEsm<TransformersModule>('@xenova/transformers').then((mod) => {
      // The model's default cache dir is derived from node_modules's own
      // install path, not process.cwd() — not stable across image
      // rebuilds unless pointed explicitly at a volume-backed path.
      mod.env.cacheDir = process.env.MODEL_CACHE_DIR ?? './.cache/transformers';
      return mod;
    });
  }
  return modulePromise;
}
