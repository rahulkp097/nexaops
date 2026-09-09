import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { AuditLogsRepository } from '../audit/audit-logs.repository';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../auth/types/request-user.type';
import { PG_POOL } from '../database/pg-pool.provider';
import { withTransaction } from '../database/transaction.util';
import { UserRow } from '../users/user.types';
import { UsersRepository } from '../users/users.repository';
import { AdminUserResponseDto, toAdminUserResponseDto } from './dto/admin-user-response.dto';
import { AuditLogResponseDto, toAuditLogResponseDto } from './dto/audit-log-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class AdminService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly usersRepository: UsersRepository,
    private readonly auditLogsRepository: AuditLogsRepository,
    private readonly auditService: AuditService,
  ) {}

  async listUsers(organizationId: string): Promise<AdminUserResponseDto[]> {
    const rows = await this.usersRepository.listByOrganization(organizationId);
    return rows.map(toAdminUserResponseDto);
  }

  async updateUser(id: string, dto: UpdateUserDto, admin: RequestUser): Promise<AdminUserResponseDto> {
    if (dto.role === undefined && dto.status === undefined) {
      throw new BadRequestException('Provide at least one of role or status to update');
    }

    const existing = await this.usersRepository.findByIdAndOrganization(id, admin.organizationId);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    await this.assertKeepsAnActiveAdmin(existing, dto, admin.organizationId);

    const updated = await withTransaction(this.pool, async (client) => {
      const row = await this.usersRepository.updateByIdAndOrganization(
        id,
        admin.organizationId,
        { role: dto.role, status: dto.status },
        client,
      );
      await this.auditService.record(
        {
          organizationId: admin.organizationId,
          userId: admin.userId,
          action: 'admin.user_updated',
          resource: 'user',
          metadata: { targetUserId: id, role: dto.role, status: dto.status },
        },
        client,
      );
      return row;
    });

    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return toAdminUserResponseDto(updated);
  }

  async listAuditLogs(organizationId: string, limit: number): Promise<AuditLogResponseDto[]> {
    const rows = await this.auditLogsRepository.listByOrganization(organizationId, limit);
    return rows.map(toAuditLogResponseDto);
  }

  // Applies to any active admin being edited, not just the caller editing
  // themselves: demoting or disabling the organization's last active admin
  // would leave nobody able to administer it (undo the change, re-enable a
  // user, etc.), so it's blocked regardless of who initiated it.
  private async assertKeepsAnActiveAdmin(
    existing: UserRow,
    dto: UpdateUserDto,
    organizationId: string,
  ): Promise<void> {
    const losesAdminAccess =
      existing.role === 'ADMIN' &&
      existing.status === 'ACTIVE' &&
      ((dto.role !== undefined && dto.role !== 'ADMIN') || (dto.status !== undefined && dto.status !== 'ACTIVE'));

    if (!losesAdminAccess) {
      return;
    }

    const remainingAdmins = await this.usersRepository.countActiveAdminsExcluding(organizationId, existing.id);
    if (remainingAdmins === 0) {
      throw new ConflictException("Cannot remove the organization's last active admin");
    }
  }
}
