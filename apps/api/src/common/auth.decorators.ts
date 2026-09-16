import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { ArvoRequest } from './request-context';

export const IS_PUBLIC = 'arvo:isPublic';

/** Marks a route as reachable without an access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The authenticated user's id. The only source of user identity for finance operations. */
export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const user = ctx.switchToHttp().getRequest<ArvoRequest>().user;
  if (!user) throw new Error('UserId used on a route without authentication');
  return user.id;
});
