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

Phase 0 (foundation) and Phase 1 (local infra — pgvector, DB roles, Redis, RabbitMQ topology, real dependency health checks) are done. Next: Phase 2 — Auth, JWT, RBAC, tenant isolation.
