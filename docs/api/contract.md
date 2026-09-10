# Gateway API contract (Phase 24)

The gateway (`apps/gateway`) is the only public HTTP surface a frontend talks to. This
document is the contract's reference: every versioned route, the versioning scheme
itself, and where the request/response shapes live.

## Versioning

Every resource route is served under a URI version prefix (`app.enableVersioning({ type:
VersioningType.URI, defaultVersion: '1' })` in `apps/gateway/src/main.ts`), so today's
contract lives entirely under `/v1`. No controller declares an explicit version — the
`defaultVersion: '1'` applies uniformly — so introducing a `/v2` route later only means
adding `@Controller({ path: '<resource>', version: '2' })` (or `@Version('2')` on a single
handler) alongside the existing one; nothing about `/v1` has to move.

`GET /health` is the one deliberate exception: it's marked `VERSION_NEUTRAL`
(`apps/gateway/src/health/health.controller.ts`) and stays reachable at the bare
`/health` path, unauthenticated. Infra probes (load balancers, container orchestrators,
`docker compose`) hit it with no knowledge of the API version and no credentials — the
same reasoning that already made it `@Public()`.

## Routes

| Method & path | Auth | Notes |
|---|---|---|
| `POST /v1/auth/register` | Public | Creates a new organization + its sole ADMIN user |
| `POST /v1/auth/login` | Public | |
| `POST /v1/auth/refresh` | Public | Rotates the refresh token; reuse of a revoked token revokes the whole session family |
| `POST /v1/auth/logout` | Public | Idempotent — an unknown/already-revoked token still returns 204 |
| `GET /v1/auth/me` | Any role | |
| `POST /v1/documents` | ADMIN | Multipart upload |
| `GET /v1/documents` | ADMIN | |
| `GET /v1/documents/:id` | ADMIN | |
| `DELETE /v1/documents/:id` | ADMIN | |
| `POST /v1/documents/:id/reindex` | ADMIN | |
| `POST /v1/conversations` | Any role | |
| `GET /v1/conversations` | Any role | Scoped to the caller's own conversations, not the whole org |
| `GET /v1/conversations/:id` | Any role | **New in Phase 24** — was missing entirely; see below |
| `GET /v1/conversations/:id/messages` | Any role | |
| `POST /v1/conversations/:id/messages` | Any role | Persists the user message immediately; the assistant reply is generated in the background |
| `GET /v1/conversations/:id/stream` | Any role | SSE — not in the original spec list, added in Phase 8 for streaming |
| `GET /v1/admin/users` | ADMIN | |
| `PATCH /v1/admin/users/:id` | ADMIN | Blocked from removing an org's last active admin |
| `GET /v1/admin/audit-logs` | ADMIN | |
| `POST /v1/evaluation/runs` | ADMIN | |
| `GET /v1/evaluation/runs` | ADMIN | |
| `GET /v1/evaluation/runs/:id` | ADMIN | |

This is the spec's own Phase 24 list verbatim, plus the streaming endpoint every chat
client also needs. `apps/ai-service`'s internal routes (`/rag/query`, `/agent/run`,
`/memory/summarize`, `/tools/execute`, `/evaluation/*`) are a separate, service-to-service
contract the gateway calls into — they are not part of this public surface and are not
versioned by this phase.

### `GET /v1/conversations/:id`

Audited against this list and found missing entirely (no controller handler, no service
method) — every other route above already existed. Added as
`ConversationsService.getOne` / `ConversationsController.getOne`, reusing the same
tenant-scoped `requireConversation` lookup (and the same 404-on-cross-tenant behavior)
every other conversation-scoped method already used.

## Shared types (`packages/shared-types`)

Every response shape and request-body shape in the table above has a single canonical
definition in `packages/shared-types/src/{auth,documents,conversations,admin,
evaluation,common}.ts`, re-exported from `packages/shared-types/src/index.ts`. Before
this phase the package held one unrelated, unused type (`HealthStatus`) and nothing in
the repo imported it.

- **Response DTOs** (`DocumentResponseDto`, `ConversationResponseDto`,
  `AuthResponseDto`, ...): the gateway's own `dto/*-response.dto.ts` files re-export the
  shared type directly (`export type { X } from '@nexaops/shared-types'`) rather than
  redeclaring it, and keep only their row-to-DTO mapper function locally — that mapper is
  an internal concern (it reads snake_case DB columns), not part of the contract.
- **Request shapes** (`LoginRequest`, `CreateConversationRequest`, `UpdateUserRequest`,
  ...): the gateway's `class-validator`-decorated DTO classes (`LoginDto`,
  `CreateConversationDto`, ...) now `implements` the matching shared interface, so a
  class that drifts from the shared shape fails to compile. The validation decorators
  themselves stay gateway-local — `class-validator` is a server-only runtime concern, not
  something a frontend consuming these types needs.
- **Shared enums** (`Role`, `UserStatus`, `DocumentStatus`, `MessageRole`,
  `EvaluationCategory`, `EvaluationRunStatus`): moved into `shared-types`; the gateway's
  own `*.types.ts` files (which also define DB-row shapes that are *not* part of the
  public contract) re-export them so internal call sites didn't need to change their
  import paths.

`packages/shared-types` has its own build step (`tsconfig.json` + `npm run build`,
producing `dist/`) so it resolves through `node_modules` like any other dependency rather
than as raw source living inside `apps/gateway`'s own `tsc` program — the latter would
have shifted the gateway's compiled output layout (a classic monorepo `rootDir` pitfall)
and broken `infra/docker/gateway.Dockerfile`'s `CMD ["node", "apps/gateway/dist/main.js"]`.
The Dockerfile now builds `packages/shared-types` before `apps/gateway`, mirroring the
per-workspace build pattern every other service's Dockerfile already uses.

`apps/web` does not consume any of this yet — it has no gateway API client at all today
(that's Phase 25's scope). This phase only establishes the shared, typed source of truth
the frontend will import from once it exists.

## Deliberately out of scope

- **SSE event payloads** (`message_start`, `token`, `source`, `message_complete`,
  `error` on `GET /v1/conversations/:id/stream`) are not yet expressed as shared types.
  They're a streaming contract a real frontend will need to parse, but that's tied to
  building the chat UI itself — Phase 25 territory, not this phase's "keep the resource
  contract versioned and typed" scope.
- **`apps/ai-service`'s internal routes** are not versioned or moved into
  `shared-types` — they're an internal service-to-service contract, not the public API
  spec §33 lists.
- **No OpenAPI/Swagger generation** was added. The spec's own ask for this phase is two
  sentences ("keep API contracts versioned and typed"); a generated spec document is a
  reasonable future addition but wasn't asked for here, and `packages/shared-types` +
  this document already give a single, typed source of truth to review against.
