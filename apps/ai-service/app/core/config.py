from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_app_url: str = "postgresql://nexaops_app:nexaops_app@localhost:55432/nexaops"
    redis_url: str = "redis://localhost:56379"

    ai_provider: str = "anthropic"
    ai_api_key: str = ""
    ai_model: str = "claude-sonnet-5"

    # Shared with services/document-worker's EMBEDDING_MODEL/MODEL_CACHE_DIR
    # — same env var names on purpose, so query-time and indexing-time
    # embeddings can't silently drift onto incompatible models.
    embedding_model: str = "Xenova/all-MiniLM-L6-v2"
    model_cache_dir: str = "./.cache/transformers"

    rag_top_k: int = 8
    rag_max_answer_tokens: int = 2048


@lru_cache
def get_settings() -> Settings:
    return Settings()
