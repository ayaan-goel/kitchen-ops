import { Injectable } from '@nestjs/common';
import { isPermission, type DashboardKind } from '@fernleaf/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth-user';

const TTL_MS = 30_000;

/** Loads the session user + role permissions, cached briefly per (userId, sessionVersion). */
@Injectable()
export class SessionUserCache {
  private readonly cache = new Map<string, { user: AuthUser | null; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, sessionVersion: number): Promise<AuthUser | null> {
    const key = `${userId}:${sessionVersion}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.user;

    const row = await this.prisma.staffUser.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    const user =
      row && row.isActive && row.sessionVersion === sessionVersion
        ? {
            id: row.id,
            name: row.name,
            email: row.email,
            roleKey: row.role.key,
            roleName: row.role.name,
            dashboard: row.role.dashboard as DashboardKind,
            permissions: new Set(row.role.permissions.filter(isPermission)),
          }
        : null;
    this.cache.set(key, { user, expiresAt: Date.now() + TTL_MS });
    return user;
  }

  /** Call after changing a user's role, status or password. */
  invalidate(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) this.cache.delete(key);
    }
  }
}
