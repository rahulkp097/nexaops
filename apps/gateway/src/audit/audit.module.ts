import { Module } from '@nestjs/common';
import { AuditLogsRepository } from './audit-logs.repository';
import { AuditService } from './audit.service';

@Module({
  providers: [AuditLogsRepository, AuditService],
  exports: [AuditService, AuditLogsRepository],
})
export class AuditModule {}
