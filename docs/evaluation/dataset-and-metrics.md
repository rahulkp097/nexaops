# AI Evaluation — Dataset and Metrics

Implements spec §26. `apps/ai-service/app/evaluation` owns execution and scoring;
`apps/gateway/src/evaluation` owns persistence and the public API
(`POST /evaluation/runs`, `GET /evaluation/runs`, `GET /evaluation/runs/:id`, all ADMIN-only).

## The dataset is fixed, and lives outside the API

`evaluation_cases` has no CRUD endpoint on purpose — spec §24's contract only lists run
endpoints. The dataset's real source of truth is `scripts/seed-evaluation-dataset.mjs`, which
talks to a running local stack like any other client (register/login, upload documents, poll for
`READY`) and then upserts `evaluation_cases` rows directly via Postgres, matched by
`(organization_id, category, question)` so re-running it updates cases in place rather than
deleting and reinserting — `evaluation_case_results.case_id` is `ON DELETE CASCADE`, so a
delete-and-reinsert would silently orphan every past run's results for any case whose id changed.

Run it against a local stack (`docker compose up -d`) with:

```
node scripts/seed-evaluation-dataset.mjs
```

It creates two organizations: the evaluation org itself, and a second "canary" org holding one
document used only by the `CROSS_TENANT` case (see below) — the two must be genuinely separate
tenants for that case to mean anything.

## How each category executes

Every category maps to exactly the pipeline that would really answer that kind of question — no
category is faked or shortcut for evaluation's sake:

| Category | Pipeline | Needs a live LLM call? |
|---|---|---|
| `DOCUMENT_QA`, `MULTI_HOP`, `EXACT_ID` | Retrieval + `generate_answer` (RAG) | Yes, for the answer half |
| `NO_ANSWER` | Same RAG path, scored for an evidence-insufficiency admission | Yes |
| `PROMPT_INJECTION` | Same RAG path, over a document containing an injection payload | Yes |
| `CROSS_TENANT` | Retrieval only — deliberately skips the LLM call entirely | No |
| `SQL` | `app.sql.validator.validate_and_rewrite` directly, on hand-authored SQL | No |
| `BUSINESS_API` | `app.tools.registry.execute()` directly, with hand-authored arguments | No |
| `COMBINED`, `AGENT_MULTI_STEP` | `app.agents.orchestrator.run_agent` | Yes |

Half the categories (`CROSS_TENANT`, `SQL`, `BUSINESS_API`) never touch the Claude API at all —
they test retrieval's tenant filter, the NL-to-SQL allowlist, and the tool registry/mock-business
data directly, bypassing the LLM step that would normally choose to call them. That's deliberate:
those properties (a WHERE clause, a validator, a registered handler) don't depend on model
behavior, so there's no reason their pass/fail should depend on the account having credits.

### Retrieval is scored before generation is attempted

For the RAG categories, `_run_rag_case` calls `app.rag.service._retrieve_context` and scores
`recallAtK`/`citationAccuracy` from its result *before* calling `generate_answer`. A plain
`run_rag_query` call bundles both steps, so if generation fails (as it always does today — the
account's zero-credit-balance gap covered in every phase since Phase 6), a naive implementation
would report zero signal for a case whose retrieval half actually worked. Splitting the two means
a real retrieval regression is still visible even while every answer-dependent case shows the same
billing error.

## Metrics are structural proxies, not an LLM judge

Spec §26 lists metrics ("answer correctness", "faithfulness", "citation accuracy") that are
conventionally scored by another model call. This project has zero real answers to judge today
(same billing gap) and "no paid AI service required for the local MVP" as a stated non-goal, so
`app/evaluation/scoring.py` computes each one as a cheap, honest proxy instead:

- **recallAtK** — did retrieval return at least one of a case's expected source filenames.
- **citationAccuracy** — what fraction of *returned* sources were expected; can't tell a
  legitimately-relevant extra source from a wrong one, only whether nothing expected showed up.
- **faithfulness** — every inline `[n]` citation marker in the answer must reference an actual
  retrieved source index. Catches one concrete hallucination shape (citing a source that doesn't
  exist) without a judge model; says nothing about ungrounded prose that carries no marker at all.
- **answerCorrectness** / **insufficientEvidenceAdmitted** / **injectionResisted** — case-insensitive
  substring checks against `expected_answer_contains` / a documented "insufficient evidence" phrase
  list / a forbidden string, respectively.
- **toolSuccessRate**, **sqlSafetyCorrect** — real, non-proxy signals: whether the tool call/SQL
  validator's actual accept-or-reject decision was correct.

None of this is a substitute for a real LLM-judge pass. Once the account has credits, Recall@K and
the SQL/tool metrics won't change (they're already real), but `answerCorrectness`/`faithfulness`
would be worth revisiting with an actual judge model rather than a substring check.

## Known gap

`totalInputTokens`/`totalOutputTokens` are always `0` (`tokenUsageAvailable: false`) — neither
`RagQueryResponse` nor `AgentRunResult` currently surface token counts on a successful call, so
this isn't something the billing gap is hiding; it would need those two return types extended
first, which is out of this phase's scope.
