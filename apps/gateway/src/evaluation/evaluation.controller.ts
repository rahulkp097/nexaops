import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestUser } from '../auth/types/request-user.type';
import { EvaluationRunDetailResponseDto } from './dto/evaluation-run-detail-response.dto';
import { EvaluationRunResponseDto } from './dto/evaluation-run-response.dto';
import { EvaluationService } from './evaluation.service';

// spec §11: "ADMIN: user/document/evaluation administration" — every route
// here is ADMIN-only, same convention as AdminController.
@Roles('ADMIN')
@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Post('runs')
  startRun(@CurrentUser() user: RequestUser): Promise<EvaluationRunResponseDto> {
    return this.evaluationService.startRun(user);
  }

  @Get('runs')
  listRuns(@CurrentUser() user: RequestUser): Promise<EvaluationRunResponseDto[]> {
    return this.evaluationService.listRuns(user.organizationId);
  }

  @Get('runs/:id')
  getRun(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EvaluationRunDetailResponseDto> {
    return this.evaluationService.getRun(id, user.organizationId);
  }
}
