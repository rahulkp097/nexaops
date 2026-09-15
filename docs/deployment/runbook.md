# Deployment runbook (Phase 26)

Phase 26 (spec §35) calls for actually provisioning managed Postgres/Redis/
RabbitMQ and deploying each service to real hosting with HTTPS. That step
needs real accounts, real provider choices, and likely real money — decided
with the user to do the groundwork only: harden the containers for
production, document exactly what a real deployment needs and in what
order, and leave the actual provisioning/account creation as a deliberate
follow-up. **Nothing described below has been provisioned. This is what to
do, not a record of what's live.**

## What changed in this phase

Every `infra/docker/*.Dockerfile` is now a real production image, not just
"the same thing Docker Compose happens to run locally":

| Service | Before | After | Non-root user | Healthcheck |
|---|---|---|---|---|
| gateway | 1.08GB, root | 271MB, multi-stage, pruned dev deps | `node` | `GET /health` |
| ai-service | 982MB, root | ~1GB (already prod-only deps), split build/runtime stages | `appuser` | `GET /health` |
| document-worker | 1.34GB, root | 873MB, multi-stage, pruned dev deps | `node` | `GET /health` |
| mock-business | 449MB, root | 200MB, multi-stage, pruned dev deps | `node` | `GET /health` |
| web | 1.78GB, root | 279MB, Next `output: 'standalone'` trace | `node` | `GET /api/health` |

`docker-compose.yml`'s `web` service now waits on `gateway`'s real health
check (`condition: service_healthy`) instead of a bare `depends_on: -
gateway`, now that gateway actually has one to wait on.

## Two real bugs the hardening pass surfaced

Both were caught by actually running the hardened images against the real
local stack, not just by making `docker build` succeed — worth knowing
about since either one will resurface in a real deployment if skipped.

**1. Existing named volumes keep their old ownership.** Switching a
container to `USER node`/`USER appuser` only gets a *new* volume's initial
content chowned correctly (Dockerfiles now `mkdir` + `chown` the
directories a volume mounts over, before `USER` takes effect). An
**already-existing** volume — like this project's own local
`document_storage`/`model_cache`/`ai_model_cache`, populated across Phases
8–25 while every container ran as root — keeps its root ownership when
reused, and the now-non-root process gets a permission-denied trying to
write into it. Symptom: document upload returns a plain 500 with no
useful message. Fix, once, per pre-existing volume:
```bash
docker run --rm -v <volume_name>:/data alpine chown -R 1000:1000 /data
```
A fresh deployment onto brand-new volumes never hits this; it only bit
this project's own long-lived local dev volumes.

**2. Docker's own `HOSTNAME` env var collides with Next's standalone
server.** Docker always injects `HOSTNAME=<container id>` into every
container. Next.js's generated `.next/standalone/apps/web/server.js` reads
`process.env.HOSTNAME` as its bind address, defaulting to `'0.0.0.0'` only
when that variable is *unset* — which it never is inside Docker. Result:
the server binds to whatever IP the container's own hostname happens to
resolve to (its bridge network address) instead of all interfaces.
Host-mapped traffic (`-p 3000:3000`) still works, because Docker's own
port-forwarding targets that same bridge IP — so this is easy to miss
entirely in normal use. What breaks: anything reaching the container from
*inside* its own network namespace, including this image's own
`HEALTHCHECK`. Fixed in `infra/docker/web.Dockerfile` with an explicit
`ENV HOSTNAME=0.0.0.0` in the runtime stage, which overrides Docker's
injected value.

## Order of operations for a real deployment

Spec §35's own list, sequenced so nothing starts before its dependencies
are actually reachable:

1. **Provision PostgreSQL with the pgvector extension.** Needs to be a real
   Postgres 16-compatible instance where `CREATE EXTENSION vector` is
   permitted (managed providers vary — confirm before committing to one).
   Run migrations (`npm run db:migrate`, pointed at the new
   `DATABASE_URL`/`DATABASE_APP_URL`) before anything else starts, and
   create the `nexaops_app`/`nexaops_readonly` roles Phase 1 defined
   locally (`infra/database/`) — the readonly role backs the NL-to-SQL tool
   (Phase 12) and must keep `default_transaction_read_only` set.
2. **Provision Redis** (caching — Phase 20 — and nothing else depends on
   it at boot).
3. **Provision RabbitMQ** (or a managed AMQP-compatible queue). The gateway
   and document-worker both need the same topology Phase 1/4 set up
   locally (`docs/architecture/rabbitmq-topology.md`) — recreate the
   exchanges/queues/DLQ before either service starts consuming.
4. **Deploy `services/mock-business`** — no dependencies, deterministic
   in-memory data, safe to deploy first.
5. **Deploy `apps/ai-service`** — needs Postgres (both roles), Redis, and
   `services/mock-business` reachable; needs `AI_API_KEY` with a real,
   funded Anthropic account (**this project's own account currently has
   zero credit balance — see BUILD_PLAN.md's known gap** — a real
   deployment answers no differently than local dev does until that's
   funded).
6. **Deploy `services/document-worker`** separately from the gateway (spec
   says so explicitly) — needs Postgres and RabbitMQ, and the same file
   storage the gateway wrote the upload to. **This is a real, unresolved
   gap, not just a config change**: `apps/gateway/src/documents/storage/
   storage.provider.ts` only implements `STORAGE_PROVIDER=local` today —
   it throws on startup for anything else — and `document-worker` reads
   from that same local disk path via the `document_storage` Docker
   volume. Two separately-hosted services have no local disk to share, so
   deploying them separately requires implementing a real object-storage
   backend (S3-compatible) for both sides first; that's new code, not
   something this phase's groundwork included.
7. **Deploy `apps/gateway`** — needs Postgres, Redis, RabbitMQ, ai-service,
   and the same shared storage as document-worker. Set `CORS_ORIGINS` to
   the real frontend origin(s) *before* traffic arrives — the gateway
   already fails closed on this (`app.enableCors({ origin: corsOrigins
   })`, sourced from that env var), so a wrong value here is a silent
   "every browser request gets blocked" failure, not a crash — this
   phase's own hardening pass hit exactly that class of bug (see above)
   from a mismatched origin during testing.
8. **Deploy `apps/web`** — needs `NEXT_PUBLIC_API_URL` set to the
   gateway's real public `/v1` origin **at build time** (it's inlined into
   the client bundle — see `infra/docker/web.Dockerfile`'s `ARG`/`ENV`
   pair — a value baked in wrong means a full rebuild, not a config
   change). Per spec's own suggestion, this is the one piece that fits a
   platform like Vercel well; everything else in this list is a
   persistent/stateful service spec explicitly says not to force onto a
   serverless function.
9. **Configure HTTPS** at whatever layer terminates TLS for each public
   endpoint (the frontend's host, and the gateway's — a reverse proxy or
   the hosting platform's own TLS termination; nothing in this codebase
   terminates TLS itself).
10. **Run smoke tests** against the real deployment:
    ```bash
    GATEWAY_URL=https://<real-gateway-host> node scripts/e2e-smoke-test.mjs
    ```
    This already exercises spec's own "verify document ingestion, RAG,
    SQL, tools, agent and auth" list end to end (Phase 21) — no new script
    needed, just point the existing one at the real host.

## Production environment variables

See `.env.production.example` for the full annotated list — the short
version: every secret (`JWT_SECRET`, `JWT_REFRESH_SECRET`,
`DB_APP_PASSWORD`, `DB_READONLY_PASSWORD`, `AI_API_KEY`) needs a freshly
generated, real value, never the local `.env`'s placeholders; every
internal-hostname URL (`postgres:5432`, `redis:6379`, `rabbitmq:5672`,
`http://ai-service:8000`) needs to become the provisioned service's real
address; `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` need the real public
hostnames, not `localhost`.

## Deliberately not done here

- No cloud account was created and nothing was provisioned or deployed —
  that was this phase's explicit, user-confirmed scope boundary.
- No Terraform/IaC was written for a specific provider, since no provider
  has been chosen yet — writing infrastructure-as-code for a hypothetical
  target would be guessing at decisions only the user can make.
- `apps/ai-service`'s Dockerfile keeps a (smaller) multi-stage split even
  though `requirements.txt` was already production-only before this phase
  (no `requirements-dev.txt` bloat to prune) — the real wins there are the
  non-root user and the healthcheck, not image size.
