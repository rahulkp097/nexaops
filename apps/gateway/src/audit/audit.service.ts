import { Injectable } from '@nestjs/common';
import { Queryable } from '../database/transaction.util';
import { AuditLogsRepository } from './audit-logs.repository';
import { RecordAuditEventInput } from './audit-log.types';

@Injectable()
export class AuditService {
  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  record(input: RecordAuditEventInput, queryable?: Queryable): Promise<void> {
    return this.auditLogsRepository.insert(input, queryable);
  }
}
