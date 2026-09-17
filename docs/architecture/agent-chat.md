# Wiring chat to the agent loop

Real conversations (`POST /v1/conversations/:id/messages`) now run through
the bounded agent/tool-calling loop (spec §22, built in Phase 13) instead
of the plain RAG pipeline they used from Phase 8 through Phase 26 — this
was the single largest documented gap left after the 26-phase build plan
finished (`BUILD_PLAN.md`'s own "known gap" note, carried since Phase 13).
This document covers the decisions, not the mechanics already covered by
each file's own comments.

## Why this was a real gap, not just an unused endpoint

`POST /agent/run` (ai-service) and the flagship-scenario test already
proved the agent loop worked — combining `get_order` and `search_documents`
correctly. But nothing in the actual chat path ever called it: real chat
only ever reached `/rag/query`/`/rag/query/stream`, so a live conversation
could never use tools at all, regardless of the account's role or the
question asked. The flagship scenario only ran through a standalone test
endpoint no real user could reach.

## Scope decision: real tool-activity streaming, not real token streaming

The agent loop's per-turn LLM call (`create_message` in
`apps/ai-service/app/rag/llm_client.py`) is blocking, not streaming — it
has to be, since the loop needs to inspect `stop_reason`/`tool_uses`
structurally each turn, decisions RAG's simpler one-shot-then-stream flow
never had to make mid-generation. Making every turn genuinely
token-streaming (switching to Anthropic's `messages.stream()` for every
turn, inspecting content-block-start events to tell a text turn from a
tool-call turn as they begin) is possible, but is a materially larger,
riskier change: it touches the low-level LLM client, needs re-verifying
against the raw streaming API's event shapes, and would have required
rewriting (not just re-running) every existing orchestrator test that
patches `create_message`'s blocking call signature.

Chose the smaller, still-real alternative: `apps/ai-service/app/agents/
orchestrator.py`'s loop body was extracted into `_run_agent_loop`, an
internal generator yielding `("tool_call_started", ...)` /
`("tool_call_finished", ...)` / `("done", AgentRunResult)` at exactly the
points the original blocking loop already made those decisions — `create_
message`'s call signature per iteration is untouched, so all 22 pre-
existing orchestrator/API/flagship tests pass unmodified (verified before
writing a single new test). `run_agent()` (the blocking function `/agent/
run` and those 22 tests depend on) is now a two-line wrapper draining that
generator for its final event; `run_agent_stream()` is the new public
generator reshaping every event into a wire-ready `AgentStreamEvent`,
consumed by the new `POST /agent/run/stream` endpoint.

Net effect: tool calls stream live — the chat UI shows "Calling
get_order…" the moment the model requests it, then ✓/✗ the moment it
resolves, before the final answer exists. The final answer text itself
arrives complete in one `done` event rather than growing token-by-token
the way RAG chat used to. This is a real, deliberate trade-off, not an
oversight — real-time tool visibility (spec §34's actual new ask) for a
one-time cost to text-arrival smoothness (a pre-existing nicety, not a
named spec requirement).

## Citations still work, now sourced from a tool call instead of a pipeline stage

Previously, `stream_rag_query` had a dedicated `source` SSE event stage
(retrieval always ran before generation). Now, retrieval only happens if
the model chooses to call `search_documents` — a real tool in the
registry, not a distinct pipeline phase — and its result shape already
matches what the citation UI needs (`documentId`/`chunkId`/`filename`/
`page`/`score`, `apps/ai-service/app/tools/search_tool.py`). Rather than
have ai-service special-case "this particular tool's result is actually a
citation," `apps/gateway/src/conversations/conversations.service.ts`'s
`runAssistantResponse` does the mapping: on every `tool_call_finished`
event where `name === 'search_documents' && ok`, it additionally emits a
`source` SSE event per result and appends to the same `sources` array that
gets persisted to `message_sources` exactly as before. ai-service's own
contract stays generic (uniform tool-call events for any tool); the
gateway — which already owned citation persistence — is where the
domain-specific translation belongs.

## Role/user id now actually reach the AI call

`ToolContext` (ai-service) needs `user_id`/`role` for per-call tool
authorization (`registry.execute`'s own check, plus `to_anthropic_tools`
never offering a disallowed tool name to the model at all — both existed
already, from Phase 13). The RAG path never needed either field, so
`ConversationsService.postMessage`'s `RequestUser` parameter was — audited,
not assumed — never forwarded past its own tenant/ownership checks.
`runAssistantResponse` now takes the full `RequestUser` as a parameter and
forwards `userId`/`role` into the new agent client's request, the same way
`organizationId` already flowed through.

## Deliberately not persisted: the tool-activity trace itself

`message_sources` still persists citations (unchanged). Which tools ran,
in what order, with what arguments/results, is shown live during
generation only (`DisplayMessage.toolActivity` in `apps/web`) and is not
written to the database — reopening a past conversation shows the final
answer and its citations, not a replay of which tools produced them. Spec
has no table for this (its own data model note from Phase 18 applies
here too: no traces/requests-shaped table exists), and Phase 18's own
request-id-correlated logging already captures tool-call activity
server-side for operational/debugging purposes. Adding a persisted column
for something already logged, purely to redisplay it in a UI a viewer
isn't looking at *during* generation anyway, would be exactly the kind of
premature schema this project has avoided at every prior scope call (RAG
answer caching, a dedicated observability table, ...).

## Live-verified

`apps/ai-service`'s full suite (260 tests, 7 new — orchestrator-level
event-ordering/shape tests plus a streaming flagship-scenario variant that
exercises real `get_order`/`search_documents` handlers, mocked only at the
LLM/mock-business/RAG-retrieval boundaries, asserting the exact SSE
sequence a chat UI renders) and `apps/gateway`'s full suite (180 tests,
`conversations.service.spec.ts` rewritten for the new event shapes) both
pass. The now-dead `AiServiceRagClient` (nothing in the gateway called
`streamQuery` once chat stopped using it) was deleted rather than left
unused, along with its spec; the `RagHistoryMessage` type it also
exported moved to a small shared `history-message.type.ts` still used by
the memory-summarization client. Against the real rebuilt stack:
`POST /agent/run/stream` reaches the real Anthropic call and fails at the
same known zero-credit-balance gap as every other LLM-touching endpoint in
this project (confirmed via direct `curl`); the existing blocking
`POST /agent/run` still behaves identically; the full `e2e-smoke-test.mjs`
suite (10/10) passes against the rebuilt gateway/ai-service; and a real
Chromium browser (Playwright, no `chromium-cli` available in this
environment) drove a full register → ask-a-question round trip through
the actual rebuilt `apps/web` image against an isolated throwaway gateway
instance (CORS being a real, working security boundary made testing
against the shared dev instance's own port impossible — see the isolated-
instance workaround in this session's own verification, not checked in),
confirming the UI renders the same clean billing-gap error with zero
unexpected console errors — tool-activity chips never fire in this
environment (the LLM call fails before ever choosing a tool), which is
expected and matches every other LLM-touching feature in this project.
