import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiServiceEvaluationClient } from './ai-service/ai-service-evaluation.client';
import { EvaluationRepository } from './evaluation.repository';
import { EvaluationService } from './evaluation.service';
import { EvaluationCaseRow } from './evaluation.types';

function makeCaseRow(overrides: Partial<EvaluationCaseRow> = {}): EvaluationCaseRow {
  return {
    id: 'case-1',
    organization_id: 'org-1',
    category: 'BUSINESS_API',
    question: 'What is the status of order 10291?',
    expected_answer_contains: 'DELAYED',
    expected_sources: [],
    expected_tool_names: [],
    metadata: {},
    created_at: new Date(),
    ...overrides,
  };
}

describe('EvaluationService', () => {
  const user = { userId: 'user-1', organizationId: 'org-1', role: 'ADMIN' as const };

  let evaluationRepository: jest.Mocked<
    Pick<
      EvaluationRepository,
      | 'listCasesByOrganization'
      | 'createRun'
      | 'completeRun'
      | 'listRunsByOrganization'
      | 'findRunByIdAndOrganization'
      | 'createCaseResults'
      | 'listCaseResultsByRun'
    >
  >;
  let aiServiceEvaluationClient: jest.Mocked<Pick<AiServiceEvaluationClient, 'run'>>;
  let service: EvaluationService;

  beforeEach(() => {
    evaluationRepository = {
      listCasesByOrganization: jest.fn(),
      createRun: jest.fn(),
      completeRun: jest.fn(),
      listRunsByOrganization: jest.fn(),
      findRunByIdAndOrganization: jest.fn(),
      createCaseResults: jest.fn(),
      listCaseResultsByRun: jest.fn(),
    };
    aiServiceEvaluationClient = { run: jest.fn() };
    service = new EvaluationService(
      evaluationRepository as unknown as EvaluationRepository,
      aiServiceEvaluationClient as unknown as AiServiceEvaluationClient,
    );
  });

  describe('startRun', () => {
    it('throws BadRequestException when the organization has no evaluation cases', async () => {
      evaluationRepository.listCasesByOrganization.mockResolvedValue([]);

      await expect(service.startRun(user)).rejects.toBeInstanceOf(BadRequestException);
      expect(evaluationRepository.createRun).not.toHaveBeenCalled();
    });

    it('runs every case through ai-service and persists a COMPLETED run with its results', async () => {
      const caseRow = makeCaseRow();
      evaluationRepository.listCasesByOrganization.mockResolvedValue([caseRow]);
      evaluationRepository.createRun.mockResolvedValue({
        id: 'run-1',
        organization_id: 'org-1',
        triggered_by_user_id: 'user-1',
        model: null,
        provider: null,
        status: 'RUNNING',
        metrics: null,
        error: null,
        started_at: new Date(),
        completed_at: null,
      });
      aiServiceEvaluationClient.run.mockResolvedValue({
        results: [
          {
            caseId: 'case-1',
            category: 'BUSINESS_API',
            question: caseRow.question,
            passed: true,
            latencyMs: 42,
            answer: '{"status":"DELAYED"}',
            scores: { toolSuccessRate: 1 },
            error: null,
          },
        ],
        metrics: { totalCases: 1, passedCases: 1, passRate: 1 },
        model: 'claude-sonnet-5',
        provider: 'anthropic',
      });
      evaluationRepository.completeRun.mockResolvedValue({
        id: 'run-1',
        organization_id: 'org-1',
        triggered_by_user_id: 'user-1',
        model: 'claude-sonnet-5',
        provider: 'anthropic',
        status: 'COMPLETED',
        metrics: { totalCases: 1, passedCases: 1, passRate: 1 },
        error: null,
        started_at: new Date(),
        completed_at: new Date(),
      });

      const result = await service.startRun(user);

      expect(aiServiceEvaluationClient.run).toHaveBeenCalledWith({
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'ADMIN',
        cases: [caseRow],
      });
      expect(evaluationRepository.createCaseResults).toHaveBeenCalledWith([
        expect.objectContaining({ runId: 'run-1', caseId: 'case-1', passed: true, latencyMs: 42 }),
      ]);
      expect(evaluationRepository.completeRun).toHaveBeenCalledWith('run-1', {
        status: 'COMPLETED',
        model: 'claude-sonnet-5',
        provider: 'anthropic',
        metrics: { totalCases: 1, passedCases: 1, passRate: 1 },
      });
      expect(result.status).toBe('COMPLETED');
    });

    it('marks the run FAILED without throwing when the ai-service call itself fails', async () => {
      evaluationRepository.listCasesByOrganization.mockResolvedValue([makeCaseRow()]);
      evaluationRepository.createRun.mockResolvedValue({
        id: 'run-1',
        organization_id: 'org-1',
        triggered_by_user_id: 'user-1',
        model: null,
        provider: null,
        status: 'RUNNING',
        metrics: null,
        error: null,
        started_at: new Date(),
        completed_at: null,
      });
      aiServiceEvaluationClient.run.mockRejectedValue(new Error('AI service request failed with status 502'));
      evaluationRepository.completeRun.mockResolvedValue({
        id: 'run-1',
        organization_id: 'org-1',
        triggered_by_user_id: 'user-1',
        model: null,
        provider: null,
        status: 'FAILED',
        metrics: null,
        error: 'AI service request failed with status 502',
        started_at: new Date(),
        completed_at: new Date(),
      });

      const result = await service.startRun(user);

      expect(evaluationRepository.createCaseResults).not.toHaveBeenCalled();
      expect(evaluationRepository.completeRun).toHaveBeenCalledWith('run-1', {
        status: 'FAILED',
        error: 'AI service request failed with status 502',
      });
      expect(result.status).toBe('FAILED');
    });
  });

  describe('getRun', () => {
    it('throws NotFoundException for a run belonging to a different organization', async () => {
      evaluationRepository.findRunByIdAndOrganization.mockResolvedValue(null);

      await expect(service.getRun('run-1', 'org-B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the run with its case results attached', async () => {
      evaluationRepository.findRunByIdAndOrganization.mockResolvedValue({
        id: 'run-1',
        organization_id: 'org-1',
        triggered_by_user_id: 'user-1',
        model: 'claude-sonnet-5',
        provider: 'anthropic',
        status: 'COMPLETED',
        metrics: { passRate: 1 },
        error: null,
        started_at: new Date(),
        completed_at: new Date(),
      });
      evaluationRepository.listCaseResultsByRun.mockResolvedValue([
        {
          id: 'result-1',
          run_id: 'run-1',
          case_id: 'case-1',
          category: 'BUSINESS_API',
          question: 'What is the status of order 10291?',
          passed: true,
          latency_ms: 42,
          answer: '{"status":"DELAYED"}',
          scores: { toolSuccessRate: 1 },
          error: null,
          created_at: new Date(),
        },
      ]);

      const result = await service.getRun('run-1', 'org-1');

      expect(result.id).toBe('run-1');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].caseId).toBe('case-1');
    });
  });

  describe('listRuns', () => {
    it('maps every run row to its response dto', async () => {
      evaluationRepository.listRunsByOrganization.mockResolvedValue([
        {
          id: 'run-1',
          organization_id: 'org-1',
          triggered_by_user_id: 'user-1',
          model: 'claude-sonnet-5',
          provider: 'anthropic',
          status: 'COMPLETED',
          metrics: { passRate: 1 },
          error: null,
          started_at: new Date(),
          completed_at: new Date(),
        },
      ]);

      const result = await service.listRuns('org-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('run-1');
    });
  });
});
