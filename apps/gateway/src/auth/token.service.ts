import { randomUUID, createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Role } from '../users/user.types';

export interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  role: Role;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('ACCESS_TOKEN_TTL') ?? '15m') as JwtSignOptions['expiresIn'],
    });
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get<string>('JWT_SECRET'),
    });
  }

  signRefreshToken(userId: string): Promise<string> {
    const payload: RefreshTokenPayload = { sub: userId, jti: randomUUID() };
    return this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.config.get<string>('REFRESH_TOKEN_TTL') ?? '7d') as JwtSignOptions['expiresIn'],
    });
  }

  verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    return this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
    });
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshTokenExpiresAt(): Date {
    const ttl = this.config.get<string>('REFRESH_TOKEN_TTL') ?? '7d';
    return new Date(Date.now() + parseDurationMs(ttl));
  }
}

// Minimal subset of the "Zeit ms"-style strings @nestjs/jwt already accepts
// as expiresIn (e.g. '15m', '7d'), needed here to compute a matching DB
// expires_at without pulling in a whole duration-parsing dependency.
function parseDurationMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported duration format: ${duration}`);
  }
  const value = Number(match[1]);
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * unitMs[match[2]];
}
