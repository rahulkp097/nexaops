import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { AdminService } from './admin.service';
import { AuditLogsRepository } from '../audit/audit-logs.repository';
import { AuditService } from '../audit/audit.service';
import { UsersRepository } from '../users/users.repository';

function makePool() {
  const clientQuery = jest.fn().mockResolvedValue(undefined);
  const release = jest.fn();
  const client = { query: clientQuery, release };
  const connect = jest.fn().mockResolvedValue(client);
  return { pool: { connect } as unknown as Pool, client };
}

describe('AdminService', () => {
  const admin = { userId: 'admin-1', organizationId: 'org-1', role: 'ADMIN' as const };

  const activeAdminRow = {
    id: 'user-2',
    organization_id: 'org-1',
    email: 'other-admin@example.com',
    password_hash: 'hash',
    role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
    created_at: new Date(),
    updated_at: new Date(),
  };

  let usersRepository: jest.Mocked<
    Pick<
      UsersRepository,
      'listByOrganization' | 'findByIdAndOrganization' | 'updateByIdAndOrganization' | 'countActiveAdminsExcluding'
    >
  >;
  let auditLogsRepository: jest.Mocked<Pick<AuditLogsRepository, 'listByOrganization'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let pool: ReturnType<typeof makePool>;
  let service: AdminService;

  beforeEach(() => {
    usersRepository = {
      listByOrganization: jest.fn(),
      findByIdAndOrganization: jest.fn(),
      updateByIdAndOrganization: jest.fn(),
      countActiveAdminsExcluding: jest.fn(),
    };
    auditLogsRepository = { listByOrganization: jest.fn() };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    pool = makePool();

    service = new AdminService(
      pool.pool,
      usersRepository as unknown as UsersRepository,
      auditLogsRepository as unknown as AuditLogsRepository,
      auditService as unknown as AuditService,
    );
  });

  describe('listUsers', () => {
    it('maps rows to the public DTO shape, dropping password_hash/organization_id', async () => {
      usersRepository.listByOrganization.mockResolvedValue([activeAdminRow]);

      const result = await service.listUsers('org-1');

      expect(usersRepository.listByOrganization).toHaveBeenCalledWith('org-1');
      expect(result).toEqual([
        {
          id: 'user-2',
          email: 'other-admin@example.com',
          role: 'ADMIN',
          status: 'ACTIVE',
          createdAt: activeAdminRow.created_at,
          updatedAt: activeAdminRow.updated_at,
        },
      ]);
    });
  });

  describe('updateUser', () => {
    it('throws BadRequestException when neither role nor status is provided', async () => {
      await expect(service.updateUser('user-2', {}, admin)).rejects.toBeInstanceOf(BadRequestException);
      expect(usersRepository.findByIdAndOrganization).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a user belonging to a different organization', async () => {
      usersRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(
        service.updateUser('user-2', { role: 'MANAGER' }, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the role, records an audit event, and returns the updated user', async () => {
      usersRepository.findByIdAndOrganization.mockResolvedValue({
        ...activeAdminRow,
        role: 'EMPLOYEE',
      });
      usersRepository.updateByIdAndOrganization.mockResolvedValue({ ...activeAdminRow, role: 'MANAGER' });

      const result = await service.updateUser('user-2', { role: 'MANAGER' }, admin);

      expect(usersRepository.updateByIdAndOrganization).toHaveBeenCalledWith(
        'user-2',
        'org-1',
        { role: 'MANAGER', status: undefined },
        pool.client,
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.user_updated',
          organizationId: 'org-1',
          userId: 'admin-1',
          metadata: expect.objectContaining({ targetUserId: 'user-2', role: 'MANAGER' }),
        }),
        pool.client,
      );
      expect(result.role).toBe('MANAGER');
    });

    it('does not check remaining admins when the target is not currently an active admin', async () => {
      usersRepository.findByIdAndOrganization.mockResolvedValue({ ...activeAdminRow, role: 'EMPLOYEE' });
      usersRepository.updateByIdAndOrganization.mockResolvedValue({ ...activeAdminRow, role: 'MANAGER' });

      await service.updateUser('user-2', { role: 'MANAGER' }, admin);

      expect(usersRepository.countActiveAdminsExcluding).not.toHaveBeenCalled();
    });

    it('allows demoting an active admin when another active admin remains', async () => {
      usersRepository.findByIdAndOrganization.mockResolvedValue(activeAdminRow);
      usersRepository.countActiveAdminsExcluding.mockResolvedValue(1);
      usersRepository.updateByIdAndOrganization.mockResolvedValue({ ...activeAdminRow, role: 'EMPLOYEE' });

      const result = await service.updateUser('user-2', { role: 'EMPLOYEE' }, admin);

      expect(usersRepository.countActiveAdminsExcluding).toHaveBeenCalledWith('org-1', 'user-2');
      expect(result.role).toBe('EMPLOYEE');
    });

    it('rejects demoting the organization’s last active admin', async () => {
      usersRepository.findByIdAndOrganization.mockResolvedValue(activeAdminRow);
      usersRepository.countActiveAdminsExcluding.mockResolvedValue(0);

      await expect(service.updateUser('user-2', { role: 'EMPLOYEE' }, admin)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(usersRepository.updateByIdAndOrganization).not.toHaveBeenCalled();
    });

    it('rejects disabling the organization’s last active admin', async () => {
      usersRepository.findByIdAndOrganization.mockResolvedValue(activeAdminRow);
      usersRepository.countActiveAdminsExcluding.mockResolvedValue(0);

      await expect(service.updateUser('user-2', { status: 'DISABLED' }, admin)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(usersRepository.updateByIdAndOrganization).not.toHaveBeenCalled();
    });

    it('applies equally to an admin editing their own account (self-lockout is blocked the same way)', async () => {
      const selfAsAdmin = { ...admin, userId: activeAdminRow.id };
      usersRepository.findByIdAndOrganization.mockResolvedValue(activeAdminRow);
      usersRepository.countActiveAdminsExcluding.mockResolvedValue(0);

      await expect(
        service.updateUser(activeAdminRow.id, { status: 'DISABLED' }, selfAsAdmin),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listAuditLogs', () => {
    it('maps rows to the public DTO shape and forwards the limit', async () => {
      auditLogsRepository.listByOrganization.mockResolvedValue([
        {
          id: 'log-1',
          organization_id: 'org-1',
          user_id: 'admin-1',
          action: 'admin.user_updated',
          resource: 'user',
          metadata: { targetUserId: 'user-2' },
          created_at: new Date(),
        },
      ]);

      const result = await service.listAuditLogs('org-1', 50);

      expect(auditLogsRepository.listByOrganization).toHaveBeenCalledWith('org-1', 50);
      expect(result).toEqual([
        expect.objectContaining({
          id: 'log-1',
          userId: 'admin-1',
          action: 'admin.user_updated',
          metadata: { targetUserId: 'user-2' },
        }),
      ]);
      expect(result[0]).not.toHaveProperty('organizationId');
    });
  });
});
