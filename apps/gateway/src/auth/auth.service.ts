import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import { isUniqueViolation } from '../database/pg-errors.util';
import { PG_POOL } from '../database/pg-pool.provider';
import { Queryable, withTransaction } from '../database/transaction.util';
import { AuditService } from '../audit/audit.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { UsersRepository } from '../users/users.repository';
import { UserRow } from '../users/user.types';
import { AuthResponseDto, MeResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { RequestMeta } from './request-meta.type';
import { RequestUser } from './types/request-user.type';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResponseDto> {
    const passwordHash = await this.passwordService.hash(dto.password);

    let result: { user: UserRow; accessToken: string; refreshToken: string };
    try {
      result = await withTransaction(this.pool, async (client) => {
        const organization = await this.organizationsRepository.create(dto.organizationName, client);
        const user = await this.usersRepository.create(
          { organizationId: organization.id, email: dto.email, passwordHash, role: 'ADMIN' },
          client,
        );
        const tokens = await this.issueTokens(user, client);
        await this.auditService.record(
          {
            organizationId: organization.id,
            userId: user.id,
            action: 'user.registered',
            resource: 'user',
            metadata: { ...meta },
          },
          client,
        );
        return { user, ...tokens };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    return this.toAuthResponse(result.user, result.accessToken, result.refreshToken);
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResponseDto> {
    const user = await this.usersRepository.findByEmail(dto.email);
    const passwordValid = user ? await this.passwordService.verify(user.password_hash, dto.password) : false;

    if (!user || user.status !== 'ACTIVE' || !passwordValid) {
      await this.auditService.record({
        organizationId: user?.organization_id,
        userId: user?.id,
        action: 'user.login_failed',
        resource: 'user',
        metadata: { email: dto.email, ...meta },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = await withTransaction(this.pool, async (client) => {
      const tokens = await this.issueTokens(user, client);
      await this.auditService.record(
        {
          organizationId: user.organization_id,
          userId: user.id,
          action: 'user.login_succeeded',
          resource: 'user',
          metadata: { ...meta },
        },
        client,
      );
      return tokens;
    });

    return this.toAuthResponse(user, accessToken, refreshToken);
  }

  async refresh(dto: RefreshDto, meta: RequestMeta): Promise<AuthResponseDto> {
    try {
      await this.tokenService.verifyRefreshToken(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.tokenService.hashRefreshToken(dto.refreshToken);
    const row = await this.refreshTokensRepository.findByHash(tokenHash);
    if (!row) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (row.revoked_at) {
      // Reuse of an already-rotated token is a theft signal: kill every
      // active session for this user, not just the one being replayed.
      await this.refreshTokensRepository.revokeAllForUser(row.user_id);
      await this.auditService.record({
        userId: row.user_id,
        action: 'security.refresh_token_reused',
        resource: 'refresh_token',
        metadata: { ...meta },
      });
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (row.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.usersRepository.findActiveById(row.user_id);
    if (!user) {
      await this.refreshTokensRepository.revokeById(row.id);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { accessToken, refreshToken } = await withTransaction(this.pool, async (client) => {
      await this.refreshTokensRepository.revokeById(row.id, client);
      const tokens = await this.issueTokens(user, client);
      await this.auditService.record(
        {
          organizationId: user.organization_id,
          userId: user.id,
          action: 'user.token_refreshed',
          resource: 'refresh_token',
          metadata: { ...meta },
        },
        client,
      );
      return tokens;
    });

    return this.toAuthResponse(user, accessToken, refreshToken);
  }

  async logout(dto: LogoutDto, meta: RequestMeta): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(dto.refreshToken);
    const row = await this.refreshTokensRepository.findByHash(tokenHash);
    // Idempotent by design: an unknown or already-revoked token still
    // returns success — no oracle for guessing valid refresh tokens.
    if (!row || row.revoked_at) {
      return;
    }

    await this.refreshTokensRepository.revokeById(row.id);
    await this.auditService.record({
      userId: row.user_id,
      action: 'user.logout',
      resource: 'refresh_token',
      metadata: { ...meta },
    });
  }

  async getProfile(requestUser: RequestUser): Promise<MeResponseDto> {
    const user = await this.usersRepository.findActiveByIdAndOrganization(
      requestUser.userId,
      requestUser.organizationId,
    );
    if (!user) {
      throw new UnauthorizedException('User is no longer active');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
    };
  }

  private async issueTokens(
    user: UserRow,
    client: Queryable,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      organizationId: user.organization_id,
      role: user.role,
    });
    const refreshToken = await this.tokenService.signRefreshToken(user.id);
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const expiresAt = this.tokenService.refreshTokenExpiresAt();
    await this.refreshTokensRepository.insert({ userId: user.id, tokenHash, expiresAt }, client);
    return { accessToken, refreshToken };
  }

  private toAuthResponse(user: UserRow, accessToken: string, refreshToken: string): AuthResponseDto {
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organization_id,
      },
    };
  }
}
