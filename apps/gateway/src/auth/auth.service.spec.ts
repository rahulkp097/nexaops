import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import { AuthService } from './auth.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { UsersRepository } from '../users/users.repository';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

function makePool() {
  const clientQuery = jest.fn().mockResolvedValue(undefined);
  const release = jest.fn();
  const client = { query: clientQuery, release };
  const connect = jest.fn().mockResolvedValue(client);
  return { pool: { connect } as unknown as Pool, client, connect };
}

describe('AuthService', () => {
  const meta = { ip: '127.0.0.1', userAgent: 'jest' };

  let organizationsRepository: jest.Mocked<Pick<OrganizationsRepository, 'create'>>;
  let usersRepository: jest.Mocked<
    Pick<UsersRepository, 'create' | 'findByEmail' | 'findActiveById' | 'findActiveByIdAndOrganization'>
  >;
  let refreshTokensRepository: jest.Mocked<
    Pick<RefreshTokensRepository, 'insert' | 'findByHash' | 'revokeById' | 'revokeAllForUser'>
  >;
  let auditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let passwordService: jest.Mocked<Pick<PasswordService, 'hash' | 'verify'>>;
  let tokenService: jest.Mocked<
    Pick<
      TokenService,
      | 'signAccessToken'
      | 'signRefreshToken'
      | 'verifyRefreshToken'
      | 'hashRefreshToken'
      | 'refreshTokenExpiresAt'
    >
  >;
  let pool: ReturnType<typeof makePool>;
  let service: AuthService;

  const activeUser = {
    id: 'user-1',
    organization_id: 'org-1',
    email: 'a@example.com',
    password_hash: 'stored-hash',
    role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    organizationsRepository = { create: jest.fn() };
    usersRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findActiveById: jest.fn(),
      findActiveByIdAndOrganization: jest.fn(),
    };
    refreshTokensRepository = {
      insert: jest.fn(),
      findByHash: jest.fn(),
      revokeById: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    passwordService = { hash: jest.fn(), verify: jest.fn() };
    tokenService = {
      signAccessToken: jest.fn().mockResolvedValue('access-token'),
      signRefreshToken: jest.fn().mockResolvedValue('refresh-token-raw'),
      verifyRefreshToken: jest.fn(),
      hashRefreshToken: jest.fn().mockReturnValue('hashed-refresh'),
      refreshTokenExpiresAt: jest.fn().mockReturnValue(new Date(Date.now() + 86_400_000)),
    };
    pool = makePool();

    service = new AuthService(
      pool.pool,
      organizationsRepository as unknown as OrganizationsRepository,
      usersRepository as unknown as UsersRepository,
      refreshTokensRepository as unknown as RefreshTokensRepository,
      auditService as unknown as AuditService,
      passwordService as unknown as PasswordService,
      tokenService as unknown as TokenService,
    );
  });

  describe('register', () => {
    it('creates an org + ADMIN user in one transaction, issues tokens, and logs an audit event', async () => {
      organizationsRepository.create.mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
        created_at: new Date(),
      });
      passwordService.hash.mockResolvedValue('hashed-password');
      usersRepository.create.mockResolvedValue(activeUser);

      const result = await service.register(
        { organizationName: 'Acme', email: 'a@example.com', password: 'password123' },
        meta,
      );

      expect(pool.connect).toHaveBeenCalled();
      expect(organizationsRepository.create).toHaveBeenCalledWith('Acme', pool.client);
      expect(usersRepository.create).toHaveBeenCalledWith(
        { organizationId: 'org-1', email: 'a@example.com', passwordHash: 'hashed-password', role: 'ADMIN' },
        pool.client,
      );
      expect(refreshTokensRepository.insert).toHaveBeenCalledWith(
        { userId: 'user-1', tokenHash: 'hashed-refresh', expiresAt: expect.any(Date) },
        pool.client,
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          action: 'user.registered',
          resource: 'user',
        }),
        pool.client,
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token-raw',
        user: { id: 'user-1', email: 'a@example.com', role: 'ADMIN', organizationId: 'org-1' },
      });
    });

    it('translates a Postgres unique-violation on email into a 409 Conflict', async () => {
      organizationsRepository.create.mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
        created_at: new Date(),
      });
      passwordService.hash.mockResolvedValue('hashed-password');
      usersRepository.create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));

      await expect(
        service.register({ organizationName: 'Acme', email: 'a@example.com', password: 'password123' }, meta),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('issues tokens and logs user.login_succeeded on success', async () => {
      usersRepository.findByEmail.mockResolvedValue(activeUser);
      passwordService.verify.mockResolvedValue(true);

      const result = await service.login({ email: 'a@example.com', password: 'password123' }, meta);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.login_succeeded', userId: 'user-1', organizationId: 'org-1' }),
        pool.client,
      );
      expect(result.accessToken).toBe('access-token');
    });

    it('rejects and logs user.login_failed for an unknown email, without calling verify', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }, meta),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(passwordService.verify).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.login_failed',
          organizationId: undefined,
          userId: undefined,
          metadata: expect.objectContaining({ email: 'nobody@example.com' }),
        }),
      );
      expect(refreshTokensRepository.insert).not.toHaveBeenCalled();
    });

    it('rejects and logs user.login_failed for a wrong password', async () => {
      usersRepository.findByEmail.mockResolvedValue(activeUser);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'a@example.com', password: 'wrong' }, meta),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.login_failed', userId: 'user-1', organizationId: 'org-1' }),
      );
    });

    it('rejects a disabled account even with the correct password', async () => {
      usersRepository.findByEmail.mockResolvedValue({ ...activeUser, status: 'DISABLED' });
      passwordService.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: 'a@example.com', password: 'password123' }, meta),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(refreshTokensRepository.insert).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const validRow = {
      id: 'rt-1',
      user_id: 'user-1',
      token_hash: 'hashed-refresh',
      expires_at: new Date(Date.now() + 86_400_000),
      revoked_at: null,
      created_at: new Date(),
    };

    it('rotates the token: revokes the old row, issues a new pair, logs user.token_refreshed', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', jti: 'jti-1' });
      refreshTokensRepository.findByHash.mockResolvedValue(validRow);
      usersRepository.findActiveById.mockResolvedValue(activeUser);

      const result = await service.refresh({ refreshToken: 'old-refresh-token' }, meta);

      expect(refreshTokensRepository.revokeById).toHaveBeenCalledWith('rt-1', pool.client);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.token_refreshed', userId: 'user-1' }),
        pool.client,
      );
      expect(result.accessToken).toBe('access-token');
    });

    it('detects reuse of an already-revoked token: revokes all sessions and logs a security event', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', jti: 'jti-1' });
      refreshTokensRepository.findByHash.mockResolvedValue({ ...validRow, revoked_at: new Date() });

      await expect(service.refresh({ refreshToken: 'stolen-token' }, meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(refreshTokensRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'security.refresh_token_reused', userId: 'user-1' }),
      );
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('rejects an expired refresh token without revoking other sessions', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', jti: 'jti-1' });
      refreshTokensRepository.findByHash.mockResolvedValue({
        ...validRow,
        expires_at: new Date(Date.now() - 1000),
      });

      await expect(service.refresh({ refreshToken: 'expired-token' }, meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(refreshTokensRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects when no row matches the presented token hash', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', jti: 'jti-1' });
      refreshTokensRepository.findByHash.mockResolvedValue(null);

      await expect(service.refresh({ refreshToken: 'unknown-token' }, meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects immediately on JWT-level verification failure, without a DB lookup', async () => {
      tokenService.verifyRefreshToken.mockRejectedValue(new Error('bad signature'));

      await expect(service.refresh({ refreshToken: 'garbage' }, meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(refreshTokensRepository.findByHash).not.toHaveBeenCalled();
    });

    it('revokes the row and rejects if the user is no longer active', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', jti: 'jti-1' });
      refreshTokensRepository.findByHash.mockResolvedValue(validRow);
      usersRepository.findActiveById.mockResolvedValue(null);

      await expect(service.refresh({ refreshToken: 'old-refresh-token' }, meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(refreshTokensRepository.revokeById).toHaveBeenCalledWith('rt-1');
    });
  });

  describe('logout', () => {
    it('is idempotent when the token is unknown or already revoked', async () => {
      refreshTokensRepository.findByHash.mockResolvedValue(null);

      await expect(service.logout({ refreshToken: 'unknown' }, meta)).resolves.toBeUndefined();

      expect(refreshTokensRepository.revokeById).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('revokes the matching row and logs user.logout', async () => {
      refreshTokensRepository.findByHash.mockResolvedValue({
        id: 'rt-1',
        user_id: 'user-1',
        token_hash: 'hashed-refresh',
        expires_at: new Date(Date.now() + 86_400_000),
        revoked_at: null,
        created_at: new Date(),
      });

      await service.logout({ refreshToken: 'valid-refresh-token' }, meta);

      expect(refreshTokensRepository.revokeById).toHaveBeenCalledWith('rt-1');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.logout', userId: 'user-1' }),
      );
    });
  });

  describe('getProfile', () => {
    it('returns the current profile for an active, correctly-scoped user', async () => {
      usersRepository.findActiveByIdAndOrganization.mockResolvedValue(activeUser);

      const profile = await service.getProfile({ userId: 'user-1', organizationId: 'org-1', role: 'ADMIN' });

      expect(usersRepository.findActiveByIdAndOrganization).toHaveBeenCalledWith('user-1', 'org-1');
      expect(profile).toEqual({ id: 'user-1', email: 'a@example.com', role: 'ADMIN', organizationId: 'org-1' });
    });

    it('rejects when the user is disabled or no longer in that organization', async () => {
      usersRepository.findActiveByIdAndOrganization.mockResolvedValue(null);

      await expect(
        service.getProfile({ userId: 'user-1', organizationId: 'org-1', role: 'ADMIN' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
