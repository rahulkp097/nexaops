import { Module } from '@nestjs/common';
import { AiServiceEvaluationClient } from './ai-service/ai-service-evaluation.client';
import { EvaluationController } from './evaluation.controller';
import { EvaluationRepository } from './evaluation.repository';
import { EvaluationService } from './evaluation.service';

@Module({
  controllers: [EvaluationController],
  providers: [EvaluationService, EvaluationRepository, AiServiceEvaluationClient],
})
export class EvaluationModule {}
