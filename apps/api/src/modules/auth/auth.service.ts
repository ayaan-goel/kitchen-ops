import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verify } from '@node-rs/argon2';
import { isPermission, type DashboardKind, type LoginInput, type MeResponse } from '@fernleaf/shared';
import type { AuthUser, SessionClaims } from '../../common/auth/auth-user';
import { Unauthenticated } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';

const INVALID_CREDENTIALS = 'Email or password is incorrect.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Verifies credentials and returns a signed session token plus the `me` payload. */
  async login(input: LoginInput): Promise<{ token: string; me: MeResponse }> {
    const user = await this.prisma.staffUser.findUnique({
      where: { email: input.email },
      include: { role: true },
    });
    // Same message for unknown email, wrong password and deactivated account (no user enumeration).
    if (!user || !user.isActive) throw new Unauthenticated(INVALID_CREDENTIALS);
    const ok = await verify(user.passwordHash, input.password);
    if (!ok) throw new Unauthenticated(INVALID_CREDENTIALS);

    await this.prisma.staffUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const claims: SessionClaims = { sub: user.id, sv: user.sessionVersion };
    const token = await this.jwt.signAsync(claims);
    return {
      token,
      me: {
        user: { id: user.id, name: user.name, email: user.email },
        role: { key: user.role.key, name: user.role.name, dashboard: user.role.dashboard as DashboardKind },
        permissions: user.role.permissions.filter(isPermission),
      },
    };
  }

  toMe(user: AuthUser): MeResponse {
    return {
      user: { id: user.id, name: user.name, email: user.email },
      role: { key: user.roleKey, name: user.roleName, dashboard: user.dashboard },
      permissions: [...user.permissions],
    };
  }
}
