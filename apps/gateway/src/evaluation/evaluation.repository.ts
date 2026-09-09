import { Inject, Injectable } from '@nestjs/common';
import { PG_POOL } from '../database/pg-pool.provider';
import { Queryable } from '../database/transaction.util';
import {
  CompleteRunInput,
  CreateCaseResultInput,
  CreateRunInput,
  EvaluationCaseResultRow,
  EvaluationCaseRow,
  EvaluationRunRow,
} from './evaluation.types';

@Injectable()
export class EvaluationRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Queryable) {}

  // The fixed dataset (spec §26) — read-only from the API's perspective;
  // rows come from scripts/seed-evaluation-dataset.mjs, not from a case
  // CRUD endpoint (spec §24's contract only lists run endpoints).
  async listCasesByOrganization(organizationId: string, queryable: Queryable = this.pool): Promise<EvaluationCaseRow[]> {
    const result = await queryable.query<EvaluationCaseRow>(
      'SELECT * FROM evaluation_cases WHERE organization_id = $1 ORDER BY created_at ASC',
      [organizationId],
    );
    return result.rows;
  }

  async createRun(input: CreateRunInput, queryable: Queryable = this.pool): Promise<EvaluationRunRow> {
    const result = await queryable.query<EvaluationRunRow>(
      `INSERT INTO evaluation_runs (id, organization_id, triggered_by_user_id, status)
       VALUES ($1, $2, $3, 'RUNNING')
       RETURNING *`,
      [input.id, input.organizationId, input.triggeredByUserId],
    );
    return result.rows[0];
  }

  async completeRun(id: string, input: CompleteRunInput, queryable: Queryable = this.pool): Promise<EvaluationRunRow> {
    const result = await queryable.query<EvaluationRunRow>(
      `UPDATE evaluation_runs
       SET status = $2, model = $3, provider = $4, metrics = $5, error = $6, completed_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.status,
        input.model ?? null,
        input.provider ?? null,
        input.metrics ? JSON.stringify(input.metrics) : null,
        input.error ?? null,
      ],
    );
    return result.rows[0];
  }

  async listRunsByOrganization(organizationId: string, queryable: Queryable = this.pool): Promise<EvaluationRunRow[]> {
    const result = await queryable.query<EvaluationRunRow>(
      'SELECT * FROM evaluation_runs WHERE organization_id = $1 ORDER BY started_at DESC',
      [organizationId],
    );
    return result.rows;
  }

  async findRunByIdAndOrganization(
    id: string,
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<EvaluationRunRow | null> {
    const result = await queryable.query<EvaluationRunRow>(
      'SELECT * FROM evaluation_runs WHERE id = $1 AND organization_id = $2',
      [id, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async createCaseResults(
    inputs: CreateCaseResultInput[],
    queryable: Queryable = this.pool,
  ): Promise<EvaluationCaseResultRow[]> {
    const rows: EvaluationCaseResultRow[] = [];
    for (const input of inputs) {
      const result = await queryable.query<EvaluationCaseResultRow>(
        `INSERT INTO evaluation_case_results
           (id, run_id, case_id, category, question, passed, latency_ms, answer, scores, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          input.id,
          input.runId,
          input.caseId,
          input.category,
          input.question,
          input.passed,
          input.latencyMs,
          input.answer,
          JSON.stringify(input.scores ?? {}),
          input.error,
        ],
      );
      rows.push(result.rows[0]);
    }
    return rows;
  }

  async listCaseResultsByRun(runId: string, queryable: Queryable = this.pool): Promise<EvaluationCaseResultRow[]> {
    const result = await queryable.query<EvaluationCaseResultRow>(
      'SELECT * FROM evaluation_case_results WHERE run_id = $1 ORDER BY created_at ASC',
      [runId],
    );
    return result.rows;
  }
}
