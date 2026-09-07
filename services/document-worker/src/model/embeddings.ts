import { loadTransformers } from './runtime';
import type { FeatureExtractionPipelineType } from '@xenova/transformers';

const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
const BATCH_SIZE = Number(process.env.EMBEDDING_BATCH_SIZE ?? '8');

type EmbeddingPipeline = FeatureExtractionPipelineType;

let pipelinePromise: Promise<EmbeddingPipeline> | null = null;

// Lazy singleton, loaded once and reused for every message this process
// handles — model load is slow, must not happen per-document.
export function getEmbeddingPipeline(): Promise<EmbeddingPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = loadTransformers().then((mod) => mod.pipeline('feature-extraction', MODEL_ID));
  }
  return pipelinePromise;
}

// mean pooling + L2 normalization is the standard sentence-embedding
// recipe for this model, and pairs correctly with pgvector's `<=>`
// (cosine distance) operator used by document_chunks queries.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const extractor = await getEmbeddingPipeline();
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const output = await extractor(batch, { pooling: 'mean', normalize: true });
    vectors.push(...(output.tolist() as number[][]));
  }
  return vectors;
}
