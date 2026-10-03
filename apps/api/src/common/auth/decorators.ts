import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@fernleaf/shared';
import type { AuthUser } from './auth-user';

export const ACCESS_KEY = 'fl:access';

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permissions'; permissions: Permission[] };

/**
 * Every route must declare exactly one of these; PermissionsGuard denies anything undeclared
 * (deny by default, TRD §4.8).
 */
export const Public = () => SetMetadata(ACCESS_KEY, { kind: 'public' } satisfies AccessRule);

/** Any signed-in staff user (e.g. /auth/me, /meta). */
export const Authenticated = () =>
  SetMetadata(ACCESS_KEY, { kind: 'authenticated' } satisfies AccessRule);

/** The user must hold ALL listed permissions. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(ACCESS_KEY, { kind: 'permissions', permissions } satisfies AccessRule);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  return request.user;
});
