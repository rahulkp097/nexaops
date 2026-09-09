# NexaOps — Build Plan

Source: `NexaOps_Complete_Project_Build_Documentation.docx`

## What this project is

A full-stack enterprise AI operations copilot:
- **Frontend**: Next.js chat UI, admin dashboard, eval/observability dashboards
- **Backend/API**: NestJS gateway (auth, RBAC, conversations, admin)
- **AI service**: FastAPI (RAG, tools, agent orchestration, NL-to-SQL, evaluation, observability)
- **Async worker**: document ingestion (extract → chunk → embed)
- **Mock business service**: fake operational APIs (customers/orders/inventory/revenue) for tool-calling demos
- **Infra**: PostgreSQL + pgvector, Redis, RabbitMQ, Docker Compose, deployment

Not backend-only — covers the whole system end to end.

## Build sequence (phase by phase, per spec §40)

| # | Phase | Milestone group |
|---|---|---|
| 0 | Development foundation (repo, Docker Compose, health endpoints) | Foundation |
| 1 | Local infra (Postgres+pgvector, Redis, RabbitMQ) | Foundation |
| 2 | Auth, JWT, RBAC, tenant isolation | Auth |
| 3 | Document management (upload, storage, status) | Ingestion |
| 4 | Document ingestion worker | Ingestion |
| 5 | Embeddings + vector storage | Ingestion |
| 6 | Basic RAG | Retrieval |
| 7 | Hybrid retrieval (vector + keyword + rerank) | Retrieval |
| 8 | Chat + streaming (SSE) | Chat |
| 9 | Admin dashboard | Chat |
| 10 | Mock business platform | Tools |
| 11 | Tool layer / registry | Tools |
| 12 | Safe NL-to-SQL | Tools |
| 13 | Agent orchestration | Agent |
| 14 | Combined RAG + tools (flagship workflow) | Agent |
| 15 | Prompt-injection protection | Hardening |
| 16 | Conversation memory | Hardening |
| 17 | AI evaluation suite | Hardening |
| 18 | Observability | Hardening |
| 19 | Reliability (retries, DLQ, idempotency) | Hardening |
| 20 | Caching | Hardening |
| 21 | Testing strategy (unit/integration/E2E/AI regression) | Hardening |
| 22 | Security checklist | Hardening |
| 23 | Docker environment | Deploy |
| 24 | API contract | Deploy |
| 25 | Frontend screens | Deploy |
| 26 | Deployment | Deploy |

**MVP-grade demo** = phases 0–14. **Production-grade** = all 26.

## Time estimate (with Claude Code, phase-by-phase, reviewed)

| Milestone | Phases | Part-time (~10-15 hrs/wk) | Focused/full-time |
|---|---|---|---|
| Foundation | 0–1 | 2–4 days | 1 day |
| Auth/RBAC/tenant isolation | 2 | 3–5 days | 1–2 days |
| Ingestion pipeline | 3–5 | 1–1.5 wks | 2–3 days |
| Retrieval (RAG + hybrid) | 6–7 | 1 wk | 2–3 days |
| Chat/streaming + admin | 8–9 | 1–1.5 wks | 3–4 days |
| Tools (mock API, registry, safe SQL) | 10–12 | 1 wk | 2–3 days |
| Agent orchestration | 13–14 | 1 wk | 2–3 days |
| Hardening (injection, memory, eval, observability) | 15–18 | 1–1.5 wks | 3–4 days |
| Reliability/caching/testing/security | 19–22 | 1 wk | 2–3 days |
| Docker/API/frontend/deployment | 23–26 | 1–1.5 wks | 3–4 days |
| **Total** | | **~8–12 weeks** | **~3–4 weeks** |

MVP alone (0–14): ~2–4 weeks part-time, ~1.5 weeks focused.

## Prerequisites

**Accounts/keys**
- LLM provider API key (provider is abstracted, swappable)
- Embedding model (hosted or local/open-source for zero-cost dev)
- (Deployment only) hosting for web, managed Postgres w/ pgvector, managed Redis, managed RabbitMQ

**Local tooling**
- Docker + Docker Compose
- Node.js, Python 3.x, Git

**Decisions before Phase 0**
- LLM provider/model
- Embedding model + vector dimension (baked into schema)
- Deployment target for stateful services (can't live on serverless/Vercel — web layer only)

No paid AI service is required for the local MVP if using a local/open embedding+model.

## Token usage estimate

Rough order of magnitude, not a quote:
- ~150K–400K tokens per phase (more for RAG/agent/eval phases, less for infra-only phases)
- ~5–10M tokens for the full 26-phase build, more with heavy debugging/iteration

Track actual usage via Claude Code session indicators rather than relying on this estimate.

## Working with Claude Code on this

The spec includes a ready-made agent prompt (§43): work one phase at a time, inspect the repo before coding, don't overwrite unrelated working code, run lint/tests after each phase, don't advance if a phase's Definition of Done isn't met. Recommended: one phase per session/PR, verified before moving to the next.

## Next step

Phase 0 (foundation), Phase 1 (local infra — pgvector, DB roles, Redis, RabbitMQ topology, real dependency health checks), Phase 2 (auth — JWT access/refresh tokens with rotation and reuse detection, RBAC guards, tenant-scoped request context, audit logging), Phase 3 (document management — admin-only upload/list/get/delete/reindex, safe storage keys, checksum-based upload idempotency, RabbitMQ ingestion publish, shared gateway/document-worker storage volume), and Phase 4+5 (document ingestion worker — PDF/DOCX/TXT extraction with page-aware metadata, local in-process embeddings via `@xenova/transformers`/all-MiniLM-L6-v2, token-based chunking, `document_chunks` pgvector schema, idempotent delete-and-replace reprocessing, x-death-based retry/DLQ classification) Phase 6 (basic RAG in `apps/ai-service` — Python-side query embedding via plain `onnxruntime`+`tokenizers` loading the identical `Xenova/all-MiniLM-L6-v2` ONNX weights document-worker uses for chunk embeddings (0.995 cosine parity verified empirically), tenant-scoped pgvector retrieval, grounded/prompt-injection-resistant system prompt, Claude Sonnet 5 answer generation behind a provider-abstraction module, `POST /rag/query` internal endpoint returning `{answer, sources}`), Phase 7 (hybrid retrieval — Postgres full-text search (GIN index on `to_tsvector(content)`) alongside the existing vector search, Reciprocal Rank Fusion merging the two ranked lists (no new ML dependency, decided with the user over a cross-encoder reranker), generic JSONB metadata filtering, consistent cosine-similarity scoring across both search methods), Phase 8 (chat and streaming — `conversations`/`messages`/`message_sources` tables; gateway endpoints `POST/GET /conversations`, `GET/POST /conversations/:id/messages`, `GET /conversations/:id/stream`; real token-level streaming via a new `POST /rag/query/stream` SSE endpoint on `apps/ai-service` built on Anthropic's `messages.stream()`, not a fake chunked-JSON replay; multi-turn history — the last 10 messages — forwarded to the LLM as real conversation turns; an in-memory per-conversation `ChatStreamRegistry` (RxJS `ReplaySubject`) decouples answer generation from whether/when a client has the SSE connection open, so the assistant reply is generated and persisted exactly once regardless; a failed generation frees the conversation for an immediate retry while a successful one persists the assistant message plus its `message_sources` citations), and Phase 9 (admin dashboard backend — `GET /admin/users`, `PATCH /admin/users/:id`, `GET /admin/audit-logs`, all ADMIN-only; role/status updates are audited (`admin.user_updated`) and blocked from removing an organization's last active admin, whether that's the caller demoting/disabling themselves or another admin — checked by counting remaining active admins, not by special-casing "self"), and Phase 10 (mock business platform in `services/mock-business` — a deterministic, seed-based (mulberry32, fixed seed) in-memory dataset of customers/products/orders/inventory/inventory events, no database; endpoints `GET /customers/:id`, `GET /orders/:id`, `GET /orders?status=&from=&to=`, `GET /inventory/:sku`, `GET /inventory/events?from=&to=`, `GET /analytics/revenue?from=&to=`; seed data deliberately includes the spec's own example — order `#10291`, delayed because `SKU-2040` (Precision Servo Motor) went out of stock — plus a second delayed order/shortage sku and 6 months of order history for a real monthly-revenue breakdown), and Phase 11 (tool layer in `apps/ai-service/app/tools` — an explicit registry of all seven spec tools: `search_documents` (reuses the Phase 6/7 RAG retrieval pipeline directly, returning raw cited excerpts instead of a synthesized answer) plus `get_order`/`get_customer`/`get_inventory_status`/`get_inventory_events`/`query_sales`/`calculate_metric` (an `httpx` client to `services/mock-business`). Every tool declares a strict pydantic input schema (also exposed as Anthropic tool-use JSON Schema via `registry.to_anthropic_tools()`), a role-based authorization requirement (business tools: ADMIN/MANAGER only, matching "MANAGER: operational knowledge and permitted analytics"; `search_documents`: every role), a timeout, and a max result size; `registry.execute()` is the single path any caller must go through, and it always returns a structured `{ok, data}` or `{ok: false, error_code, error_message}` — never a raw exception — so a future LLM-driven agent loop always gets something to react to. Tenant context (`organization_id`) is a parameter the server supplies, never a field the model can set. A new internal `POST /tools/execute` endpoint (same no-auth trust model as `/rag/query`) exercises this without a live LLM in the loop yet) are done. Next: Phase 12 — Safe Natural-Language-to-SQL.

**Known gap (found in Phase 11)**: `query_sales` and `calculate_metric` are backed by mock-business's canned REST analytics (`/orders`, `/analytics/revenue`), not genuine natural-language-to-SQL — there is no SQL involved at all yet. Phase 12 is the dedicated, separate feature for that (schema-aware LLM SQL generation → parser/validator → read-only `nexaops_readonly` role → timeout/row limits), targeting the exact same "what was our revenue in August" example. It's an open question whether Phase 12 replaces these two tools' implementation or adds new ones alongside them — worth deciding when that phase starts. Separately: nothing calls the tool registry from a live LLM conversation yet — `POST /tools/execute` is a manual/internal seam for testing; wiring an actual "LLM decides to call a tool" loop is Phase 13 (Agent Orchestration).

**Known gap**: `AI_API_KEY` has a valid key configured but the Anthropic account has zero credit balance. Live-verified through `docker compose` end to end: register → login → create conversation → post message (persisted immediately) → open `GET /conversations/:id/stream` and observe real SSE events (`message_start` then `error`) → confirm only the user message was persisted and the conversation was immediately free for a retry. The retrieval pipeline (embed → hybrid search → prompt construction, now including multi-turn history) runs correctly end to end against real documents; the actual Claude answer-generation call still hasn't produced a real answer live, pending billing being set up on the account. One known rough edge from this phase: if a client opens `GET /conversations/:id/stream` only after `POST .../messages` has already returned, an extremely fast failure (like this billing rejection, which fails before any token is streamed) can occasionally finish and evict itself before that GET request lands, returning 404 instead of the `error` event — a real (non-instant) LLM call streams for long enough that this isn't a practical problem, and posting a new message is unaffected either way.

**Known gap (found in Phase 9)**: there is still no way to add a second user to an existing organization through the API. `POST /auth/register` is the only user-creation path, and it always creates a brand-new organization with that user as its sole ADMIN — there's no invite/create-user-in-an-existing-org endpoint anywhere in the spec's API contract (§33 lists only `GET /admin/users` and `PATCH /admin/users/:id`, no `POST`). Phase 9's admin endpoints (list/update/audit) are fully built and live-verified, but were only exercisable end-to-end by seeding a second user directly via SQL — a real deployment currently has no way to grow an org past one user. Worth deciding explicitly (an invite-by-email flow, an admin-issued signup link/code, or an admin-created-user-with-temp-password flow) before this matters for a real demo; not addressed here since it's outside every phase's stated scope so far.
