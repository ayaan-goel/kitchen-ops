import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@fernleaf/shared';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/common/auth/auth-user';
import { ACCESS_KEY, type AccessRule } from '../src/common/auth/decorators';
import { PermissionsGuard } from '../src/common/auth/permissions.guard';
import { Forbidden } from '../src/common/errors/domain-error';

function contextFor(rule: AccessRule | undefined, permissions: Permission[] | null): ExecutionContext {
  const handler = () => undefined;
  if (rule) Reflect.defineMetadata(ACCESS_KEY, rule, handler);
  const user: AuthUser | undefined = permissions
    ? {
        id: 'u1',
        name: 'Test',
        email: 't@test.com',
        roleKey: 'ANY',
        roleName: 'Any',
        dashboard: 'ADMIN',
        permissions: new Set(permissions),
      }
    : undefined;
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard (deny by default, permission-based)', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('denies routes without an access rule', () => {
    expect(() => guard.canActivate(contextFor(undefined, ['staff.read']))).toThrow(Forbidden);
  });

  it('allows public and authenticated routes', () => {
    expect(guard.canActivate(contextFor({ kind: 'public' }, null))).toBe(true);
    expect(guard.canActivate(contextFor({ kind: 'authenticated' }, []))).toBe(true);
  });

  it('requires every listed permission', () => {
    const rule: AccessRule = { kind: 'permissions', permissions: ['orders.read', 'orders.write'] };
    expect(guard.canActivate(contextFor(rule, ['orders.read', 'orders.write']))).toBe(true);
    expect(() => guard.canActivate(contextFor(rule, ['orders.read']))).toThrow(Forbidden);
  });

  it('never looks at role names', () => {
    // A user whose role is called ADMIN but lacks the permission is still denied.
    const ctx = contextFor({ kind: 'permissions', permissions: ['billing.manage'] }, ['dashboard.view']);
    expect(() => guard.canActivate(ctx)).toThrow(Forbidden);
  });
});
