import asyncio

import numpy as np
import onnxruntime
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

from app.core.config import get_settings

_session: onnxruntime.InferenceSession | None = None
_tokenizer: Tokenizer | None = None

# all-MiniLM-L6-v2's real intended sequence length (its
# sentence_bert_config.json max_seq_length, not the tokenizer's hard
# 512-token truncation ceiling) — matches the chunk target already used
# when this model embeds chunks in Phase 4's document-worker.
MAX_SEQUENCE_LENGTH = 256


def _load_model_sync() -> tuple[onnxruntime.InferenceSession, Tokenizer]:
    settings = get_settings()
    model_path = hf_hub_download(
        repo_id=settings.embedding_model,
        filename="onnx/model_quantized.onnx",
        cache_dir=settings.model_cache_dir,
    )
    tokenizer_path = hf_hub_download(
        repo_id=settings.embedding_model,
        filename="tokenizer.json",
        cache_dir=settings.model_cache_dir,
    )
    session = onnxruntime.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    tokenizer = Tokenizer.from_file(tokenizer_path)
    tokenizer.enable_truncation(max_length=MAX_SEQUENCE_LENGTH)
    return session, tokenizer


async def init_embedding_model() -> None:
    """Eager warm-up, called from app.main's lifespan — mirrors
    services/document-worker/src/index.ts's startIngestion() warm-up:
    surfaces model-load/network failures in boot logs rather than on
    whatever request happens to arrive first, and avoids a slow cold
    start mid-request."""
    global _session, _tokenizer
    if _session is None or _tokenizer is None:
        _session, _tokenizer = await asyncio.to_thread(_load_model_sync)


def _mean_pool_normalize(last_hidden_state: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    # Replicates document-worker's { pooling: 'mean', normalize: true }
    # exactly — verified empirically at 0.995 cosine similarity against
    # the real @xenova/transformers pipeline for the same input text.
    mask = attention_mask[..., None].astype(np.float32)
    summed = (last_hidden_state * mask).sum(axis=1)
    counts = np.clip(mask.sum(axis=1), a_min=1e-9, a_max=None)
    pooled = summed / counts
    norm = np.clip(np.linalg.norm(pooled, axis=1, keepdims=True), a_min=1e-9, a_max=None)
    return pooled / norm


def _embed_query_sync(text: str) -> list[float]:
    if _session is None or _tokenizer is None:
        raise RuntimeError("Embedding model not initialized — call init_embedding_model() first")

    encoding = _tokenizer.encode(text)
    input_ids = np.array([encoding.ids], dtype=np.int64)
    attention_mask = np.array([encoding.attention_mask], dtype=np.int64)
    token_type_ids = np.zeros_like(input_ids)

    outputs = _session.run(
        None,
        {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "token_type_ids": token_type_ids,
        },
    )
    return _mean_pool_normalize(outputs[0], attention_mask)[0].tolist()


async def embed_query(text: str) -> list[float]:
    return await asyncio.to_thread(_embed_query_sync, text)
