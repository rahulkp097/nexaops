import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RequestUser } from '../auth/types/request-user.type';
import { AiServiceEvaluationClient } from './ai-service/ai-service-evaluation.client';
import {
  EvaluationRunDetailResponseDto,
  toEvaluationRunDetailResponseDto,
} from './dto/evaluation-run-detail-response.dto';
import { EvaluationRunResponseDto, toEvaluationRunResponseDto } from './dto/evaluation-run-response.dto';
import { EvaluationRepository } from './evaluation.repository';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly evaluationRepository: EvaluationRepository,
    private readonly aiServiceEvaluationClient: AiServiceEvaluationClient,
  ) {}

  // Synchronous, spec §24-style ("POST /evaluation/runs") request/response
  // — unlike chat, there's no reason to stream partial progress, and every
  // case already has its own bound (tool timeout, agent timeout budget),
  // so the whole run is finite. A single case's own LLM error is already
  // folded into that case's result by ai-service (never thrown here) — an
  // exception at this level means the whole call failed (ai-service
  // unreachable), which marks the run FAILED rather than losing it silently.
  async startRun(user: RequestUser): Promise<EvaluationRunResponseDto> {
    const cases = await this.evaluationRepository.listCasesByOrganization(user.organizationId);
    if (cases.length === 0) {
      throw new BadRequestException(
        'No evaluation cases are configured for this organization. Run scripts/seed-evaluation-dataset.mjs first.',
      );
    }

    const run = await this.evaluationRepository.createRun({
      id: randomUUID(),
      organizationId: user.organizationId,
      triggeredByUserId: user.userId,
    });

    try {
      const payload = await this.aiServiceEvaluationClient.run({
        organizationId: user.organizationId,
        userId: user.userId,
        role: user.role,
        cases,
      });

      if (payload.results.length > 0) {
        await this.evaluationRepository.createCaseResults(
          payload.results.map((result) => ({
            id: randomUUID(),
            runId: run.id,
            caseId: result.caseId,
            category: result.category,
            question: result.question,
            passed: result.passed,
            latencyMs: result.latencyMs,
            answer: result.answer,
            scores: result.scores,
            error: result.error,
          })),
        );
      }

      const completed = await this.evaluationRepository.completeRun(run.id, {
        status: 'COMPLETED',
        model: payload.model,
        provider: payload.provider,
        metrics: payload.metrics,
      });
      return toEvaluationRunResponseDto(completed);
    } catch (error) {
      this.logger.error(`Evaluation run ${run.id} failed`, error instanceof Error ? error.stack : String(error));
      const failed = await this.evaluationRepository.completeRun(run.id, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Evaluation run failed',
      });
      return toEvaluationRunResponseDto(failed);
    }
  }

  async listRuns(organizationId: string): Promise<EvaluationRunResponseDto[]> {
    const rows = await this.evaluationRepository.listRunsByOrganization(organizationId);
    return rows.map(toEvaluationRunResponseDto);
  }

  async getRun(id: string, organizationId: string): Promise<EvaluationRunDetailResponseDto> {
    const run = await this.evaluationRepository.findRunByIdAndOrganization(id, organizationId);
    if (!run) {
      throw new NotFoundException('Evaluation run not found');
    }
    const results = await this.evaluationRepository.listCaseResultsByRun(run.id);
    return toEvaluationRunDetailResponseDto(run, results);
  }
}
