import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenService } from '../token.service';
import { AuthenticatedRequest } from '../types/request-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  // spec §27's trace tree names "authentication" as its own traced stage —
  // a failure here never has request.user to log yet, so it's the one
  // stage worth its own explicit line rather than relying on the final
  // status-code-only line RequestLoggingMiddleware already logs for every
  // request. Never logs the token itself — only that one was missing or
  // rejected.
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      this.logger.warn(`Authentication failed: missing bearer token (${request.method} ${request.originalUrl})`);
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(token);
      request.user = {
        userId: payload.sub,
        organizationId: payload.organizationId,
        role: payload.role,
      };
      return true;
    } catch {
      this.logger.warn(`Authentication failed: invalid or expired token (${request.method} ${request.originalUrl})`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}
