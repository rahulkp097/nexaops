import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from '../token.service';

function makeContext(headers: Record<string, string>): ExecutionContext {
  const request: Record<string, unknown> = { headers };
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const verifyAccessToken = jest.fn();
  const tokenService = { verifyAccessToken } as unknown as TokenService;

  function makeGuard(isPublic: boolean) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
    return new JwtAuthGuard(tokenService, reflector);
  }

  beforeEach(() => {
    verifyAccessToken.mockReset();
  });

  it('bypasses everything for a @Public() route without touching request.user', async () => {
    const guard = makeGuard(true);
    const context = makeContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', async () => {
    const guard = makeGuard(false);
    const context = makeContext({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed Authorization header', async () => {
    const guard = makeGuard(false);
    const context = makeContext({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when token verification fails', async () => {
    verifyAccessToken.mockRejectedValue(new Error('invalid signature'));
    const guard = makeGuard(false);
    const context = makeContext({ authorization: 'Bearer bad-token' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sets request.user to exactly {userId, organizationId, role} for a valid token', async () => {
    verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      organizationId: 'org-1',
      role: 'MANAGER',
    });
    const guard = makeGuard(false);
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer good-token' } };
    const context = {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', organizationId: 'org-1', role: 'MANAGER' });
  });
});
