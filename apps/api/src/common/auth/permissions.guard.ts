import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from './auth-user';
import { ACCESS_KEY, type AccessRule } from './decorators';
import { Forbidden } from '../errors/domain-error';

/**
 * Deny by default: a route must be @Public, @Authenticated or @RequirePermissions(...).
 * Code checks permissions only — never role names (ACC-04).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) throw new Forbidden('This route has no access rule (denied by default).');
    if (rule.kind === 'public' || rule.kind === 'authenticated') return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new Forbidden();
    const missing = rule.permissions.filter((p) => !user.permissions.has(p));
    if (missing.length > 0) throw new Forbidden();
    return true;
  }
}
