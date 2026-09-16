import { HttpStatus, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../common/api-exception.filter';
import { IS_PUBLIC } from '../common/auth.decorators';
import type { ArvoRequest } from '../common/request-context';
import { AuthService } from './auth.service';

/** Global guard: every route requires a Bearer access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<ArvoRequest>();
    const [scheme, token] = (req.header('authorization') ?? '').split(' ');
    const userId = scheme === 'Bearer' && token ? await this.auth.verifyAccessToken(token) : null;
    if (!userId) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'A valid access token is required');
    }
    req.user = { id: userId };
    return true;
  }
}
