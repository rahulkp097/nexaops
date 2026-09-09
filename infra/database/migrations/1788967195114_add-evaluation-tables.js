/**
 * Phase 17 (spec §26, AI Evaluation) + §7's data model: `evaluation_cases`
 * is the fixed dataset (seeded by scripts/seed-evaluation-dataset.mjs, not
 * created through the API — spec §24's contract only lists run endpoints,
 * no case CRUD). `evaluation_runs` is one execution of that dataset;
 * `evaluation_case_results` is the per-case detail spec §7 folds into
 * "evaluation_runs: case results, scores, latency" — split into its own
 * table (rather than a jsonb array column) so a single case's result can be
 * queried/indexed on its own, matching how message_sources is split out
 * from messages.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createType('evaluation_case_category', [
    'DOCUMENT_QA',
    'NO_ANSWER',
    'EXACT_ID',
    'MULTI_HOP',
    'SQL',
    'BUSINESS_API',
    'COMBINED',
    'AGENT_MULTI_STEP',
    'PROMPT_INJECTION',
    'CROSS_TENANT',
  ]);

  pgm.createTable('evaluation_cases', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'CASCADE' },
    category: { type: 'evaluation_case_category', notNull: true },
    question: { type: 'text', notNull: true },
    // Substring the answer must contain, case-insensitive. Null when a
    // category's pass condition doesn't depend on answer text (e.g. SQL).
    expected_answer_contains: { type: 'text' },
    // Filenames the retrieved/cited sources should include (recall@K) —
    // '[]' means "no expectation", not "expect zero sources".
    expected_sources: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    // Tool names an agent run should have called, for COMBINED/AGENT_MULTI_STEP.
    expected_tool_names: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    // Category-specific execution/scoring config the runner can't express
    // in the columns above without a column per category — e.g. SQL's
    // candidate query text and expectRejection flag, PROMPT_INJECTION's
    // forbidden substring, BUSINESS_API's tool name/arguments,
    // CROSS_TENANT's canary filename. See app/evaluation/types.py.
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('evaluation_cases', 'organization_id');

  pgm.createTable('evaluation_runs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'CASCADE' },
    triggered_by_user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    model: { type: 'text' },
    provider: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'RUNNING' },
    // Aggregate metrics (spec §26: recall@K, citation accuracy, tool
    // success rate, etc., averaged/summed across this run's cases) — null
    // until the run completes.
    metrics: { type: 'jsonb' },
    // Set only when the run itself failed (e.g. ai-service unreachable) —
    // distinct from an individual case failing, which is captured per-row
    // in evaluation_case_results.error without failing the whole run.
    error: { type: 'text' },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('evaluation_runs', 'organization_id');

  pgm.createTable('evaluation_case_results', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: { type: 'uuid', notNull: true, references: 'evaluation_runs', onDelete: 'CASCADE' },
    case_id: { type: 'uuid', notNull: true, references: 'evaluation_cases', onDelete: 'CASCADE' },
    // Denormalized from evaluation_cases so a run's results remain
    // meaningful even if a case is later edited/removed from the fixed
    // dataset — same reasoning as message_sources keeping its own filename.
    category: { type: 'evaluation_case_category', notNull: true },
    question: { type: 'text', notNull: true },
    passed: { type: 'boolean', notNull: true },
    latency_ms: { type: 'integer', notNull: true },
    answer: { type: 'text' },
    scores: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    error: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('evaluation_case_results', 'run_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('evaluation_case_results');
  pgm.dropTable('evaluation_runs');
  pgm.dropTable('evaluation_cases');
  pgm.dropType('evaluation_case_category');
};
