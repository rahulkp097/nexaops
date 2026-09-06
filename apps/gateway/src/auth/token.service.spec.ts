import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        ACCESS_TOKEN_TTL: '15m',
        REFRESH_TOKEN_TTL: '7d',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    service = new TokenService(new JwtService(), config);
  });

  it('signs and verifies an access token round-trip', async () => {
    const token = await service.signAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      role: 'ADMIN',
    });

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      sub: 'user-1',
      organizationId: 'org-1',
      role: 'ADMIN',
    });
  });

  it('rejects an access token verified with the wrong secret', async () => {
    const otherService = new TokenService(new JwtService(), {
      get: jest.fn().mockReturnValue('a-completely-different-secret'),
    } as unknown as ConfigService);

    const token = await service.signAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      role: 'ADMIN',
    });

    await expect(otherService.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects an expired access token', async () => {
    const shortLived = new TokenService(new JwtService(), {
      get: jest.fn((key: string) => (key === 'ACCESS_TOKEN_TTL' ? '0s' : config.get(key))),
    } as unknown as ConfigService);

    const token = await shortLived.signAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      role: 'ADMIN',
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(shortLived.verifyAccessToken(token)).rejects.toThrow();
  });

  it('signs and verifies a refresh token round-trip, carrying a jti', async () => {
    const token = await service.signRefreshToken('user-1');
    const payload = await service.verifyRefreshToken(token);

    expect(payload.sub).toBe('user-1');
    expect(payload.jti).toEqual(expect.any(String));
  });

  it('hashes refresh tokens deterministically', () => {
    const hashA = service.hashRefreshToken('some-token-value');
    const hashB = service.hashRefreshToken('some-token-value');
    const hashC = service.hashRefreshToken('a-different-token-value');

    expect(hashA).toEqual(hashB);
    expect(hashA).not.toEqual(hashC);
  });

  it('computes a refresh token expiry consistent with REFRESH_TOKEN_TTL', () => {
    const before = Date.now();
    const expiresAt = service.refreshTokenExpiresAt();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(before + sevenDaysMs + 1000);
  });
});
