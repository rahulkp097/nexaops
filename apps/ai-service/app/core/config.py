from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_app_url: str = "postgresql://nexaops_app:nexaops_app@localhost:55432/nexaops"
    # Phase 12's NL-to-SQL tool connects with this role, never database_app_url
    # — it is SELECT-only and read-only-transaction at the Postgres role level
    # (see infra/database/migrations/..._create-db-roles-and-grants.js), so a
    # bug in the app-layer validator is not the only thing standing between a
    # generated query and a write.
    database_readonly_url: str = "postgresql://nexaops_readonly:nexaops_readonly@localhost:55432/nexaops"
    redis_url: str = "redis://localhost:56379"

    ai_provider: str = "anthropic"
    ai_api_key: str = ""
    ai_model: str = "claude-sonnet-5"
    # Phase 19 (spec §28: "Timeouts on external/model calls"): explicit
    # rather than the SDK's own 10-minute default — every call in this app
    # is bounded well under a minute in practice (rag_max_answer_tokens is
    # 2048, agent turns are capped tighter still), so a hung connection
    # should surface as a timeout long before that. max_retries is also
    # explicit rather than left implicit: the SDK already retries
    # connection errors, 429, and 5xx with exponential backoff on its own
    # (spec's "Circuit-breaker/backoff where appropriate" — this project
    # doesn't need a bespoke one on top of what the provider SDK gives for
    # free) — a 400 (e.g. the account's known zero-credit-balance rejection)
    # is never retried either way, since it isn't transient.
    ai_request_timeout_seconds: float = 60.0
    ai_max_retries: int = 2

    # Shared with services/document-worker's EMBEDDING_MODEL/MODEL_CACHE_DIR
    # — same env var names on purpose, so query-time and indexing-time
    # embeddings can't silently drift onto incompatible models.
    embedding_model: str = "Xenova/all-MiniLM-L6-v2"
    model_cache_dir: str = "./.cache/transformers"

    rag_top_k: int = 8
    rag_max_answer_tokens: int = 2048
    # Each of vector/keyword search fetches this many candidates before
    # RRF fuses and trims down to rag_top_k (Phase 7 hybrid retrieval).
    rag_candidate_pool_size: int = 20

    # Phase 10's deterministic mock operational API — no tenant concept of
    # its own (see app/tools/business_client.py), unlike documents/RAG.
    mock_business_url: str = "http://localhost:4200"
    # Default per-tool-call timeout (Phase 11 spec: every registered tool
    # declares one); individual tools may override it.
    tool_call_timeout_seconds: float = 5.0

    # Phase 12: safe natural-language-to-SQL, scoped to the sales_orders
    # analytics table (see app/sql/schema.py).
    sql_generation_max_tokens: int = 300
    sql_row_limit: int = 100

    # Phase 13: agent orchestration bounds (spec §22's own required list —
    # "Maximum tool calls. Maximum iterations. Timeout budget. Token/context
    # budget."). All four are enforced in app/agents/orchestrator.py.
    agent_max_iterations: int = 6
    agent_max_tool_calls: int = 8
    agent_timeout_seconds: float = 45.0
    agent_max_tokens_per_turn: int = 1024
    agent_max_total_tokens: int = 20_000

    # Phase 16: conversation memory. The gateway summarizes messages that
    # have aged out of its bounded recent-message window; this bounds the
    # LLM call that produces (and rolls forward) that summary.
    memory_summary_max_tokens: int = 400


@lru_cache
def get_settings() -> Settings:
    return Settings()
