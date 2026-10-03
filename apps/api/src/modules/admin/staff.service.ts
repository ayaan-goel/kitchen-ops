import { Injectable } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { RoleDto, StaffDto } from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { SessionUserCache } from '../../common/auth/session-user.cache';
import { NotFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { fail } from './companies.service';

const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  role: { select: { id: true, name: true } },
} as const;

/**
 * Staff accounts (ACC-02, A-37). The admin sets the initial password. Changing someone's role,
 * deactivating them or resetting their password bumps `sessionVersion`, which signs them out
 * everywhere on their next request.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionUserCache,
  ) {}

  async roles(): Promise<RoleDto[]> {
    const rows = await this.prisma.role.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { staff: true } } } });
    return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, staff: r._count.staff }));
  }

  async list(): Promise<StaffDto[]> {
    const rows = await this.prisma.staffUser.findMany({ select: STAFF_SELECT, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return rows.map((s) => ({ ...s, lastLoginAt: s.lastLoginAt?.toISOString() ?? null }));
  }

  async create(input: { name: string; email: string; phone: string | null; roleId: string; password: string }): Promise<StaffDto[]> {
    if (!(await this.prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true } }))) throw fail('VALIDATION_FAILED', 'roleId', 'Unknown role.');
    if (await this.prisma.staffUser.findUnique({ where: { email: input.email }, select: { id: true } })) throw fail('VALIDATION_FAILED', 'email', 'A staff account with this email already exists.');
    await this.prisma.staffUser.create({
      data: { name: input.name, email: input.email, phone: input.phone, roleId: input.roleId, passwordHash: await hash(input.password) },
    });
    return this.list();
  }

  async update(id: string, input: { name?: string; phone?: string | null; roleId?: string; isActive?: boolean }, actor: AuthUser): Promise<StaffDto[]> {
    const user = await this.prisma.staffUser.findUnique({ where: { id } });
    if (!user) throw new NotFound('Staff member not found');
    // Guard against locking everyone out: you can't deactivate or demote yourself here.
    if (id === actor.id && (input.isActive === false || (input.roleId && input.roleId !== user.roleId))) {
      throw fail('VALIDATION_FAILED', input.isActive === false ? 'isActive' : 'roleId', 'You can’t deactivate or change the role of your own account. Ask another admin.');
    }
    if (input.roleId && !(await this.prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true } }))) throw fail('VALIDATION_FAILED', 'roleId', 'Unknown role.');
    const revoke = (input.roleId !== undefined && input.roleId !== user.roleId) || (input.isActive !== undefined && input.isActive !== user.isActive);
    await this.prisma.staffUser.update({
      where: { id },
      data: { name: input.name, phone: input.phone, roleId: input.roleId, isActive: input.isActive, ...(revoke ? { sessionVersion: { increment: 1 } } : {}) },
    });
    // Drop the cached session immediately; otherwise the old role would still work for up to 30 s.
    this.sessions.invalidate(id);
    return this.list();
  }

  async setPassword(id: string, password: string): Promise<StaffDto[]> {
    const updated = await this.prisma.staffUser.updateMany({ where: { id }, data: { passwordHash: await hash(password), sessionVersion: { increment: 1 } } });
    if (updated.count === 0) throw new NotFound('Staff member not found');
    this.sessions.invalidate(id);
    return this.list();
  }
}
