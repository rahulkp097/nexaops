# NexaOps

AI Enterprise Operations Copilot. See `BUILD_PLAN.md` for the phased build plan and `NexaOps_Complete_Project_Build_Documentation.docx` for the full specification.

## Repository structure

```
apps/
  web/            Next.js frontend (chat, admin, eval UI)
  gateway/        NestJS API gateway (auth, RBAC, conversations, admin)
  ai-service/     FastAPI AI service (RAG, tools, agents, evaluation)
services/
  document-worker/  Async document ingestion worker
  mock-business/     Mock operational business API
packages/
  shared-types/    Shared TypeScript types/DTOs
  config/          Shared configuration
infra/
  docker/          Dockerfiles per service
  database/        Migrations
docs/              Architecture, API, security, evaluation docs
scripts/           Dev/ops scripts
```

## Prerequisites

- Node.js >= 20
- Python >= 3.11
- Docker + Docker Compose

## Local setup

1. Copy environment config:
   ```bash
   cp .env.example .env
   ```
2. Start all services:
   ```bash
   docker compose up -d
   docker compose ps
   ```
3. Check health endpoints:
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:4000/health
   curl http://localhost:8000/health
   curl http://localhost:4100/health
   curl http://localhost:4200/health
   ```

## Running services outside Docker (development)

```bash
npm install
npm run dev:web       # Next.js on :3000
npm run dev:gateway   # NestJS on :4000

cd apps/ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

## Testing

```bash
npm run test          # JS/TS workspaces
cd apps/ai-service && pytest
```

## Build sequence

This project is built phase by phase. See `BUILD_PLAN.md` for the full sequence and current status. Phase 0 (this scaffold) is complete when all Docker Compose containers are healthy and all application services start locally.
