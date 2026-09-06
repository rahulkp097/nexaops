import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../../users/user.types';

function makeContext(role: Role): ExecutionContext {
  const request = { user: { userId: 'user-1', organizationId: 'org-1', role } };
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeGuard(requiredRoles: Role[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows access when the route has no @Roles() metadata', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext('EMPLOYEE'))).toBe(true);
  });

  it('allows access when the caller has one of the required roles', () => {
    const guard = makeGuard(['ADMIN', 'MANAGER']);
    expect(guard.canActivate(makeContext('MANAGER'))).toBe(true);
  });

  it('rejects access when the caller does not have a required role', () => {
    const guard = makeGuard(['ADMIN']);
    expect(() => guard.canActivate(makeContext('EMPLOYEE'))).toThrow(ForbiddenException);
  });
});
