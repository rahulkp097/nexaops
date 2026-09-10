# Frontend architecture (Phase 25)

`apps/web` (Next.js App Router) implements spec §34's full screen list: login,
main chat, conversation history, source/citation panel, document management,
upload/progress view, users/RBAC, evaluation dashboard, observability
dashboard, settings. This document covers the decisions that aren't obvious
from the code alone.

## Auth: tokens in `localStorage`, not cookies

`POST /v1/auth/login`/`register`/`refresh` return `{ accessToken,
refreshToken }` in the JSON body, not a `Set-Cookie` header — there was
nothing for a cookie-based approach to attach to. Every authenticated route
in this app is client-rendered (there's no server-personalized page that
would need the token during SSR), so `lib/token-storage.ts` just keeps both
tokens in `localStorage`, and `lib/api-client.ts`'s `apiFetch` attaches
`Authorization: Bearer <token>` on every request, refreshing once and
retrying on a 401 (with in-flight-refresh deduping, so several requests
401ing around the same moment don't each rotate the refresh token and race
each other into "already used" failures).

## Streaming: `fetch` + manual SSE parsing, not `EventSource`

`GET /v1/conversations/:id/stream` needs a bearer token, and the native
`EventSource` API cannot attach custom headers. `lib/sse.ts` duplicates
`apps/gateway/src/conversations/ai-service/sse.util.ts`'s block-parsing
algorithm (deliberately not shared via `@nexaops/shared-types` — it's
runtime logic, not a type, and that package is types-only) and
`lib/api/conversations.ts#streamConversation` drives it over a plain
`fetch()` with the header attached, the same approach
`scripts/e2e-smoke-test.mjs` already validates against the real backend.

## Chat state has to live above the page, not in it

Sending the first message in a new conversation has to: create the
conversation, persist the user message, then navigate the URL to
`/chat/<id>` so it's bookmarkable and highlighted in the sidebar — all
*while* a streaming response is still arriving token-by-token. Next.js's App
Router unmounts a route's `page.tsx` component tree when navigating between
sibling routes (`/chat` → `/chat/[conversationId]`), which would otherwise
throw away the in-flight streaming state at the exact moment the URL changes
to reflect it.

The fix: `lib/chat-context.tsx`'s `ChatProvider` lives in
`app/(app)/chat/layout.tsx`, a *shared layout* both routes render under —
Next.js layouts persist across navigations within them, so the provider (and
the message list, streaming buffer, etc. it holds) survives the route
change untouched. Each page (`chat/page.tsx`, `chat/[conversationId]/
page.tsx`) is a thin client component whose only job is to call
`setActiveConversation(id | null)` with its own route param; that function
is a no-op when the requested id is already the active one — which is
exactly what happens when `sendMessage` itself sets the new conversation id
and calls `router.replace()`, so the resulting remount doesn't reset
anything.

## Observability dashboard: scoped to what's actually real

Phase 18 (spec §27) deliberately built request-id-correlated *logging*, not
a persisted traces/requests table or a query API for one — the spec's own
data model has no such table. There is therefore no request-trace search or
latency chart this dashboard could honestly show without inventing backend
work outside this phase's scope. `components/observability/
observability-page.tsx` shows the two signals that ARE real and already
queryable: live gateway dependency health (`GET /health`) and the audit
trail (`GET /v1/admin/audit-logs`). A fuller trace-search view is future
work tied to revisiting Phase 18's own scope, not something to fake here.

## RBAC: hidden in the nav, enforced per-page

`components/nav.tsx` filters admin-only links (Documents, Users, Evaluation,
Observability) by `user.role`, but that's a UX nicety, not the actual
authorization boundary — the real authorization already lives server-side in
the gateway's `@Roles('ADMIN')` guards (unchanged since earlier phases,
authorization-in-code being a project-wide principle since Phase 15).
`components/require-admin.tsx` wraps each admin-only page so a direct or
bookmarked URL still redirects a non-admin to `/chat` client-side, catching
the case the hidden nav link doesn't (someone typing the URL directly).

## `@nexaops/shared-types` gets a real second consumer

Phase 24 populated this package but only wired `apps/gateway` to it.
`apps/web` is the second consumer, and needed no new plumbing: the package
already has its own `tsc` build step (`packages/shared-types/tsconfig.json`
→ `dist/`), so it resolves through `node_modules` exactly like any other
dependency for both apps — no `transpilePackages` entry needed in
`next.config.mjs`. `infra/docker/web.Dockerfile` now builds `shared-types`
before `apps/web`, mirroring `gateway.Dockerfile`'s existing pattern. A new
SSE event union (`ChatStreamEvent` and friends) was added to
`packages/shared-types/src/conversations.ts` in this phase — Phase 24 had
deliberately left it out since no consumer existed yet.

## `NEXT_PUBLIC_API_URL` is a build-time value

Next.js inlines `NEXT_PUBLIC_*` env vars into the client bundle at build
time, not at container start — so it has to be a Docker build `ARG`
(`infra/docker/web.Dockerfile`), passed via `docker-compose.yml`'s `build.
args`, not a plain `environment:`/`env_file` entry (which only affects the
running container, too late for anything already baked into the JS bundle).
It defaults to `http://localhost:4000/v1` — the gateway's *host-mapped* port,
since it has to be reachable from wherever the browser actually runs, not
from inside the Docker Compose network the way `AI_SERVICE_URL` or
`DATABASE_APP_URL` are.

## Live-verified, not just type-checked

`next build` type-checks the whole app (no errors were an implicit pass
condition throughout this phase), and `apps/web`'s own Jest suite covers
`apiFetch`'s auth/refresh logic — the highest-risk, most testable piece of
non-visual logic. But the actual screens were verified for real: this
environment has no `chromium-cli` (the tooling this project's own `run`
skill normally reaches for), so a throwaway Playwright driver script (not
committed — a scratch/one-off verification tool) drove a real Chromium
against both the dev server and the built Docker image, registering a real
org, sending a real chat message (confirming the citation panel renders
real retrieved sources even though the answer step fails at the account's
known zero-credit-balance gap), uploading a real document through to
READY, reindexing and deleting it, updating a user via the admin screen,
triggering both a real evaluation run and the "no cases configured" error
path, and reading real audit-log/health data on the observability screen —
with zero unexpected browser console errors across the entire run.
